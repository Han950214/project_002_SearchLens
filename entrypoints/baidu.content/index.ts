import "./style.css";
import { runBaiduAdapter } from "../../src/adapters/baidu/baidu-search-adapter";
import type { SearchResult } from "../../src/models/search-result";

export default defineContentScript({
  matches: ["https://www.baidu.com/s*", "https://baidu.com/s*"],
  runAt: "document_idle",

  main() {
    console.log("[SearchLens] Content script loaded. URL:", location.href);
    console.log("[SearchLens] isWebSearchTab:", isWebSearchTab());
    console.log("[SearchLens] content_left exists:", !!document.getElementById("content_left"));
    if (!isWebSearchTab()) {
      console.log("[SearchLens] Not a web search tab — exiting.");
      return;
    }

    let panel: HTMLDivElement | null = null;
    let adapterResults: SearchResult[] = [];

    function isWebSearchTab(): boolean {
      const activeTab = document.querySelector("#s_tab .cur, .s_tab .cur");
      if (!activeTab) return true;
      const text = activeTab.textContent?.trim() ?? "";
      return text === "" || text === "网页";
    }

    function runAndRefresh(): void {
      const output = runBaiduAdapter(document);
      console.log("[SearchLens] Adapter output:", JSON.stringify({ pageKind: output.pageKind, query: output.query, resultCount: output.results.length, error: output.error }));
      adapterResults = output.results;
      if (output.pageKind !== "web_search") { removePanel(); return; }
      if (panel) { updatePanelBody(); }
      else { insertPanel(); }
    }

    function createPanel(): HTMLDivElement {
      const container = document.createElement("div");
      container.id = "searchlens-panel";
      container.className = "searchlens-panel";
      container.innerHTML = `<div class="searchlens-header">
        <span class="searchlens-logo">🔍 SearchLens</span>
        <span class="searchlens-tagline">优先识别官网、官方下载和可信来源</span>
        <button class="searchlens-close-btn" title="关闭">✕</button>
      </div>
      <div class="searchlens-body" id="searchlens-body"></div>`;
      container.querySelector(".searchlens-close-btn")?.addEventListener("click", removePanel);
      return container;
    }

    function updatePanelBody(): void {
      const body = panel?.querySelector("#searchlens-body");
      if (!body) return;

      if (adapterResults.length === 0) {
        body.innerHTML = `<div class="searchlens-empty">
          <p>SearchLens 没有找到足够可信的入口，请谨慎核对百度原始结果。</p>
        </div>`;
        return;
      }

      const itemsHtml = adapterResults.slice(0, 5).map((r, i) => {
        const typeLabel = getTypeLabel(r);
        const domain = getSourceLabel(r);
        return `<div class="searchlens-item">
          <div class="searchlens-item-title">${i + 1}. ${escapeHtml(r.title)}</div>
          <div class="searchlens-item-domain">${escapeHtml(domain)}</div>
          <div class="searchlens-item-meta">${escapeHtml(typeLabel)} · rank ${r.originalRank}${r.isAdOrPromoted ? " · 推广" : ""}</div>
          <div class="searchlens-item-actions">
            <button class="searchlens-btn-sm" disabled>提升</button>
            <button class="searchlens-btn-sm" disabled>降低</button>
            <button class="searchlens-btn-sm" disabled>隐藏</button>
          </div>
        </div>`;
      }).join("");

      body.innerHTML = itemsHtml + `<div class="searchlens-footer">
        <span class="searchlens-count">已提取 ${adapterResults.length} 条结果 · M2 解析层已加载</span>
        <button class="searchlens-btn searchlens-settings-btn">⚙ 设置</button>
      </div>`;

      body.querySelector(".searchlens-settings-btn")?.addEventListener("click", () => {
        browser.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch(() => {});
      });
    }

    function getTypeLabel(r: SearchResult): string {
      if (r.isAdOrPromoted) return "推广";
      if (r.detectedType === "baidu_baike") return "百度百科";
      if (r.detectedType === "baidu_zhidao") return "百度知道";
      if (r.detectedType === "third_party_download_site") return "第三方下载站";
      if (r.detectedType === "github_repo") return "GitHub";
      return "未分类";
    }

    function getSourceLabel(r: SearchResult): string {
      const source = (r.displayUrl || r.domain || "unknown").trim();
      const normalized = source.toLowerCase();
      if (!source || normalized.startsWith("javascript:")) return "unknown";
      if (normalized === "www.baidu.com" || normalized === "baidu.com") return "unknown";
      return source;
    }

    function escapeHtml(s: string): string {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function insertPanel(): void {
      if (panel) return;
      const contentLeft = document.getElementById("content_left");
      if (!contentLeft) {
        console.log("[SearchLens] Cannot find content_left — exiting.");
        return;
      }
      panel = createPanel();
      const firstChild = contentLeft.firstChild;
      if (firstChild) { contentLeft.insertBefore(panel, firstChild); }
      else { contentLeft.appendChild(panel); }
      updatePanelBody();
      console.log("[SearchLens] M2 Panel inserted, results:", adapterResults.length);
    }

    function removePanel(): void {
      if (panel) { panel.remove(); panel = null; }
    }

    setTimeout(() => runAndRefresh(), 500);

    const tabObserver = new MutationObserver(() => {
      if (!isWebSearchTab()) { removePanel(); }
      else if (!panel) { runAndRefresh(); }
    });
    const tabBar = document.querySelector("#s_tab, .s_tab");
    if (tabBar) {
      tabObserver.observe(tabBar, {
        attributes: true, subtree: true, attributeFilter: ["class"], childList: true,
      });
    }
  },
});
