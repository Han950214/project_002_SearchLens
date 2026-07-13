import "./style.css";
import { runScoredAdapter, type DomainPrefMap } from "../../src/adapters/baidu/baidu-search-adapter";
import { toDisplayItem } from "../../src/scoring/recommendation-engine";
import type { ScoredAdapterOutput } from "../../src/adapters/baidu/baidu-search-adapter";
import type { SearchResult } from "../../src/models/search-result";
import type { SearchLensSettings } from "../../src/storage/chrome-local-storage-adapter";

export default defineContentScript({
  matches: ["https://www.baidu.com/s*", "https://baidu.com/s*"],
  runAt: "document_idle",

  main() {
    console.log("[SearchLens] Content script loaded. URL:", location.href);

    if (!isWebSearchTab()) {
      console.log("[SearchLens] Not a web search tab — exiting.");
      return;
    }

    // ── State ──
    let panel: HTMLDivElement | null = null;
    let lastOutput: ScoredAdapterOutput | null = null;
    let domainPrefs: DomainPrefMap = {};
    let recommendationLimit = 5;
    let showConfidence = true;
    let showReasons = true;
    let warnThirdPartyDownloadSites = true;

    // ── Initialise: load user preferences + settings from storage ──
    async function loadPrefs(): Promise<void> {
      try {
        const prefs = await browser.runtime.sendMessage({ type: "GET_DOMAIN_PREFERENCES" });
        if (prefs && typeof prefs === "object") domainPrefs = prefs as DomainPrefMap;
      } catch (err) {
        console.warn("[SearchLens] Failed to load domain prefs:", err);
      }
      try {
        const settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" }) as Partial<SearchLensSettings>;
        if (typeof settings?.recommendationLimit === "number") recommendationLimit = settings.recommendationLimit;
        if (typeof settings?.showConfidence === "boolean") showConfidence = settings.showConfidence;
        if (typeof settings?.showReasons === "boolean") showReasons = settings.showReasons;
        if (typeof settings?.warnThirdPartyDownloadSites === "boolean") {
          warnThirdPartyDownloadSites = settings.warnThirdPartyDownloadSites;
        }
      } catch (err) {
        console.warn("[SearchLens] Failed to load settings:", err);
      }
    }

    function isWebSearchTab(): boolean {
      const activeTab = document.querySelector("#s_tab .cur, .s_tab .cur");
      if (!activeTab) return true;
      const text = activeTab.textContent?.trim() ?? "";
      return text === "" || text === "网页";
    }

    // -----------------------------------------------------------------------
    // DOM stabilization
    // -----------------------------------------------------------------------
    let domSettleTimer: number | undefined;

    function waitForStableDom(callback: () => void, settleMs = 800, maxMs = 4000): void {
      const contentLeft = document.getElementById("content_left");
      if (!contentLeft) {
        setTimeout(callback, settleMs);
        return;
      }

      let done = false;
      let settleTimer: number | undefined;
      let maxTimer: number | undefined;
      let fastTimer: number | undefined;

      const finish = () => {
        if (done) return;
        done = true;
        observer.disconnect();
        if (settleTimer) clearTimeout(settleTimer);
        if (maxTimer) clearTimeout(maxTimer);
        if (fastTimer) clearTimeout(fastTimer);
        callback();
      };

      const handler = () => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = window.setTimeout(finish, settleMs);
      };

      const observer = new MutationObserver(handler);
      observer.observe(contentLeft, { childList: true, subtree: true });

      maxTimer = window.setTimeout(finish, maxMs);

      if (contentLeft.querySelectorAll(RESULT_CONTAINER_SELECTOR).length > 0) {
        fastTimer = window.setTimeout(finish, 100);
      }
    }

    const RESULT_CONTAINER_SELECTOR = "div.c-container, div.ec_result, div.ec_wise_ad, div.result-op";

    function logDiagnostics(results: SearchResult[]): void {
      const topDomains = [...new Set(results.map(r => r.domain).filter(Boolean))].slice(0, 5);
      const topTitles = results.slice(0, 5).map(r => `"${(r.title ?? "").substring(0, 30)}"`).join(", ");
      console.log("[SearchLens] Diag:", JSON.stringify({
        query: document.querySelector<HTMLInputElement>("#kw")?.value ?? "",
        candidateCount: results.length,
        topDomains,
        topTitles,
      }));
    }

    function runAndRefresh(): void {
      // Re-load prefs for fresh data each run
      loadPrefs().then(() => {
        const output = runScoredAdapter(document, domainPrefs, recommendationLimit);
        lastOutput = output;

        console.log("[SearchLens] Adapter output:", JSON.stringify({
          pageKind: output.pageKind,
          query: output.query,
          resultCount: output.results.length,
          recCount: output.recommendations?.top.length ?? 0,
          intent: output.recommendations?.intent,
          error: output.error,
        }));

        if (output.results.length > 0) logDiagnostics(output.results);
        if (output.pageKind !== "web_search") { removePanel(); return; }
        if (panel) { updatePanelBody(); }
        else { insertPanel(); }
      });
    }

    // -----------------------------------------------------------------------
    // Panel DOM
    // -----------------------------------------------------------------------

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

      const recs = lastOutput?.recommendations;
      const topItems = recs?.top ?? [];

      if (topItems.length === 0) {
        body.innerHTML = `<div class="searchlens-empty">
          <p>SearchLens 没有找到足够可信的入口，请谨慎核对百度原始结果。</p>
        </div>`;
        return;
      }

      const itemsHtml = topItems.map((r, i) => {
        const item = toDisplayItem(r, i + 1);
        const domain = getSourceLabel(r);
        const reasonHtml = showReasons && item.topReason
          ? `<span class="searchlens-reason" title="${escapeHtml(item.reasons.map(rs => rs.label).join(" · "))}">${escapeHtml(item.topReason)}</span>`
          : "";
        const confidenceHtml = showConfidence
          ? `<span class="searchlens-conf-badge ${item.confidenceClass}">${escapeHtml(item.confidenceLabel)}</span>`
          : "";
        const downloadWarningHtml = warnThirdPartyDownloadSites && r.detectedType === "third_party_download_site"
          ? '<span class="searchlens-download-warning">第三方下载站，请谨慎核对</span>'
          : "";

        return `<div class="searchlens-item" data-domain="${escapeHtml(item.domain)}">
          <div class="searchlens-item-score">
            <span class="searchlens-score-bar ${item.scoreBarClass}" style="width:${item.score}%"></span>
            <span class="searchlens-score-label">${item.score}</span>
          </div>
          <div class="searchlens-item-content">
            <div class="searchlens-item-title">${item.rank}. ${escapeHtml(item.title)}</div>
            <div class="searchlens-item-domain">${escapeHtml(domain)}</div>
            <div class="searchlens-item-meta">
              <span class="searchlens-type-badge ${item.confidenceClass}">${escapeHtml(item.typeLabel)}</span>
              ${confidenceHtml}
              ${item.isAd ? '<span class="searchlens-ad-badge">推广</span>' : ""}
              ${downloadWarningHtml}
              ${reasonHtml}
            </div>
            <div class="searchlens-item-actions">
              <button class="searchlens-btn-sm searchlens-promote-btn" data-domain="${escapeHtml(item.domain)}">提升</button>
              <button class="searchlens-btn-sm searchlens-demote-btn" data-domain="${escapeHtml(item.domain)}">降低</button>
              <button class="searchlens-btn-sm searchlens-hide-btn" data-domain="${escapeHtml(item.domain)}">隐藏</button>
            </div>
          </div>
        </div>`;
      }).join("");

      body.innerHTML = itemsHtml + `<div class="searchlens-footer">
        <span class="searchlens-count">已评 ${recs?.all.length ?? 0} 条 · 推荐 ${topItems.length} 条 · M3 已加载</span>
        <button class="searchlens-btn searchlens-settings-btn">⚙ 设置</button>
      </div>`;

      // ── Wire up preferences buttons ──
      body.querySelectorAll(".searchlens-promote-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const domain = (btn as HTMLElement).dataset.domain;
          if (!domain) return;
          await setDomainPref(domain, "promote");
        });
      });
      body.querySelectorAll(".searchlens-demote-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const domain = (btn as HTMLElement).dataset.domain;
          if (!domain) return;
          await setDomainPref(domain, "demote");
        });
      });
      body.querySelectorAll(".searchlens-hide-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const domain = (btn as HTMLElement).dataset.domain;
          if (!domain) return;
          await setDomainPref(domain, "hide");
        });
      });

      body.querySelector(".searchlens-settings-btn")?.addEventListener("click", () => {
        browser.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch(() => {});
      });
    }

    async function setDomainPref(domain: string, action: "promote" | "demote" | "hide"): Promise<void> {
      try {
        await browser.runtime.sendMessage({
          type: "SET_DOMAIN_PREFERENCE",
          payload: { domain, action },
        });
        // Update local cache and re-render
        domainPrefs[domain] = action;
        runAndRefresh();
      } catch (err) {
        console.error("[SearchLens] Failed to set preference:", err);
      }
    }

    function getSourceLabel(r: SearchResult): string {
      const source = (r.displayUrl || r.domain || "unknown").trim();
      const normalized = source.toLowerCase();
      if (!source || normalized.startsWith("javascript:")) return "unknown";
      if (normalized === "www.baidu.com" || normalized === "baidu.com") return "unknown";
      return source;
    }

    function escapeHtml(s: string): string {
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
      console.log("[SearchLens] M3 Panel inserted");
    }

    function removePanel(): void {
      if (panel) { panel.remove(); panel = null; }
    }

    function isPanelAttached(): boolean {
      return panel !== null && document.contains(panel);
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    loadPrefs().then(() => {
      waitForStableDom(() => {
        runAndRefresh();
      });
    });

    // -----------------------------------------------------------------------
    // Tab-switch observer
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // content_left observer — debounced re-extraction on DOM change
    // -----------------------------------------------------------------------

    const contentLeftEl = document.getElementById("content_left");
    if (contentLeftEl) {
      const contentObserver = new MutationObserver(() => {
        if (panel && !document.contains(panel)) {
          console.log("[SearchLens] Panel detached from DOM — re-running.");
          panel = null;
          runAndRefresh();
          return;
        }

        if (domSettleTimer) clearTimeout(domSettleTimer);
        domSettleTimer = window.setTimeout(() => {
          domSettleTimer = undefined;
          runAndRefresh();
        }, 600);
      });
      contentObserver.observe(contentLeftEl, { childList: true, subtree: false });
    }
  },
});
