import "./style.css";
import { runScoredAdapter, type DomainPrefMap } from "../../src/adapters/baidu/baidu-search-adapter";
import { getRecommendations, toDisplayItem } from "../../src/scoring/recommendation-engine";
import type { ScoredAdapterOutput } from "../../src/adapters/baidu/baidu-search-adapter";
import type { SearchResult } from "../../src/models/search-result";
import type { SearchLensSettings } from "../../src/storage/chrome-local-storage-adapter";
import { normalizeDomain } from "../../src/utils/domain";

const RESULT_CONTAINER_SELECTOR = "div.c-container, div.ec_result, div.ec_wise_ad, div.result-op";

export default defineContentScript({
  matches: ["https://www.baidu.com/s*", "https://baidu.com/s*"],
  runAt: "document_idle",

  main() {
    if (!isWebSearchTab()) return;

    let panel: HTMLDivElement | null = null;
    let lastOutput: ScoredAdapterOutput | null = null;
    let domainPrefs: DomainPrefMap = {};
    let recommendationLimit = 5;
    let enabled = true;
    let showConfidence = true;
    let showReasons = true;
    let warnThirdPartyDownloadSites = true;
    let dismissed = false;
    let domSettleTimer: number | undefined;
    let toastTimer: number | undefined;

    function isWebSearchTab(): boolean {
      const activeTab = document.querySelector("#s_tab .cur, .s_tab .cur");
      if (!activeTab) return true;
      const text = activeTab.textContent?.trim() ?? "";
      return text === "" || text === "网页";
    }

    async function loadPreferences(): Promise<boolean> {
      let failed = false;

      try {
        const prefs = await browser.runtime.sendMessage({ type: "GET_DOMAIN_PREFERENCES" });
        if (prefs && typeof prefs === "object") domainPrefs = prefs as DomainPrefMap;
      } catch (err) {
        failed = true;
        console.warn("[SearchLens] Failed to load domain preferences:", err);
      }

      try {
        const settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" }) as Partial<SearchLensSettings>;
        enabled = settings?.enabled !== false;
        if (typeof settings?.recommendationLimit === "number") recommendationLimit = settings.recommendationLimit;
        if (typeof settings?.showConfidence === "boolean") showConfidence = settings.showConfidence;
        if (typeof settings?.showReasons === "boolean") showReasons = settings.showReasons;
        if (typeof settings?.warnThirdPartyDownloadSites === "boolean") {
          warnThirdPartyDownloadSites = settings.warnThirdPartyDownloadSites;
        }
      } catch (err) {
        failed = true;
        console.warn("[SearchLens] Failed to load settings:", err);
      }

      return failed;
    }

    function waitForStableDom(callback: () => void, settleMs = 800, maxMs = 4000): void {
      const contentLeft = document.getElementById("content_left");
      if (!contentLeft) {
        window.setTimeout(callback, settleMs);
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

      const observer = new MutationObserver(() => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = window.setTimeout(finish, settleMs);
      });
      observer.observe(contentLeft, { childList: true, subtree: true });

      maxTimer = window.setTimeout(finish, maxMs);
      if (contentLeft.querySelectorAll(RESULT_CONTAINER_SELECTOR).length > 0) {
        fastTimer = window.setTimeout(finish, 100);
      }
    }

    function createPanel(): HTMLDivElement {
      const container = document.createElement("div");
      container.id = "searchlens-panel";
      container.className = "searchlens-panel";
      container.dataset.searchlensRoot = "true";
      container.setAttribute("aria-label", "SearchLens 可信度辅助面板");
      container.innerHTML = `
        <div class="searchlens-header">
          <div class="searchlens-brand">
            <span class="searchlens-brand-mark" aria-hidden="true">SL</span>
            <span><strong>SearchLens</strong><small>可信度辅助判断</small></span>
          </div>
          <div class="searchlens-header-actions">
            <button class="searchlens-icon-btn searchlens-settings-btn" type="button">设置</button>
            <button class="searchlens-icon-btn searchlens-close-btn" type="button" title="关闭本页面板" aria-label="关闭本页面板">×</button>
          </div>
        </div>
        <div class="searchlens-summary">
          <span>当前搜索：<strong class="searchlens-query">—</strong></span>
          <span class="searchlens-summary-divider" aria-hidden="true"></span>
          <span class="searchlens-rec-count">正在分析搜索结果</span>
        </div>
        <div class="searchlens-body" id="searchlens-body"></div>
        <div class="searchlens-toast" role="status" aria-live="polite" hidden></div>`;

      container.querySelector(".searchlens-close-btn")?.addEventListener("click", () => {
        dismissed = true;
        removePanel();
      });
      container.querySelector(".searchlens-settings-btn")?.addEventListener("click", () => {
        browser.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch((err) => {
          console.error("[SearchLens] Failed to open options:", err);
          showToast("设置页打开失败，请从扩展管理页进入。", "error");
        });
      });
      container.querySelector("#searchlens-body")?.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        const preferenceButton = target?.closest<HTMLButtonElement>("button[data-pref-action]");
        const domain = preferenceButton?.dataset.domain;
        const action = preferenceButton?.dataset.prefAction as "promote" | "demote" | "hide" | undefined;
        if (preferenceButton && domain && action) {
          void setDomainPreference(preferenceButton, domain, action);
          return;
        }

        const detailButton = target?.closest<HTMLButtonElement>("button[data-detail-toggle]");
        const card = detailButton?.closest<HTMLElement>(".searchlens-card");
        const details = card?.querySelector<HTMLElement>(".searchlens-details");
        if (detailButton && details) {
          const expanded = details.hidden;
          details.hidden = !expanded;
          detailButton.setAttribute("aria-expanded", String(expanded));
          detailButton.textContent = expanded ? "收起原因" : "查看原因";
        }
      });

      return container;
    }

    function insertPanel(): boolean {
      if (panel || dismissed) return panel !== null;
      const contentLeft = document.getElementById("content_left");
      if (!contentLeft) return false;

      panel = createPanel();
      contentLeft.insertBefore(panel, contentLeft.firstChild);
      return true;
    }

    function removePanel(): void {
      panel?.remove();
      panel = null;
    }

    function renderLoading(): void {
      const body = panel?.querySelector("#searchlens-body");
      if (!body) return;
      body.innerHTML = `<div class="searchlens-state searchlens-loading" aria-busy="true">
        <span class="searchlens-spinner" aria-hidden="true"></span>
        <div><strong>正在整理推荐结果</strong><p>等待百度搜索结果稳定后进行本地分析…</p></div>
      </div>`;
    }

    function renderError(message: string): void {
      const body = panel?.querySelector("#searchlens-body");
      if (!body) return;
      body.innerHTML = `<div class="searchlens-state searchlens-error-state">
        <span class="searchlens-state-symbol" aria-hidden="true">!</span>
        <div><strong>本次分析未完成</strong><p>${escapeHtml(message)}。百度原始搜索结果仍可正常使用，请自行核对来源。</p></div>
      </div>`;
      updateHeader(lastOutput?.query ?? getCurrentQuery(), 0);
    }

    function updateHeader(query: string, count: number): void {
      const queryNode = panel?.querySelector(".searchlens-query");
      const countNode = panel?.querySelector(".searchlens-rec-count");
      if (queryNode) queryNode.textContent = query || "未识别";
      if (countNode) countNode.textContent = count > 0 ? `推荐 ${count} 条` : "暂无推荐";
    }

    function renderPanel(): void {
      const body = panel?.querySelector("#searchlens-body");
      if (!body) return;

      if (lastOutput?.error) {
        renderError(lastOutput.error);
        return;
      }

      const recommendations = lastOutput?.recommendations;
      const topItems = recommendations?.top ?? [];
      updateHeader(lastOutput?.query ?? getCurrentQuery(), topItems.length);

      if (topItems.length === 0) {
        body.innerHTML = `<div class="searchlens-state searchlens-empty-state">
          <span class="searchlens-state-symbol" aria-hidden="true">i</span>
          <div><strong>当前没有可推荐结果</strong><p>这不代表原始结果安全或不安全，请核对网站域名、推广标记和下载来源。</p></div>
        </div>
        <div class="searchlens-footer"><span>可信度仅用于辅助判断</span><button class="searchlens-text-settings-btn" type="button">管理偏好</button></div>`;
        body.querySelector(".searchlens-text-settings-btn")?.addEventListener("click", openOptions);
        return;
      }

      const cards = topItems.map((result, index) => renderRecommendation(result, index + 1)).join("");
      body.innerHTML = `<div class="searchlens-list">${cards}</div>
        <div class="searchlens-footer">
          <span>已分析 ${recommendations?.all.length ?? 0} 条 · 可信度仅用于辅助判断</span>
          <button class="searchlens-text-settings-btn" type="button">管理全部偏好</button>
        </div>`;
      body.querySelector(".searchlens-text-settings-btn")?.addEventListener("click", openOptions);
    }

    function renderRecommendation(result: SearchResult, rank: number): string {
      const item = toDisplayItem(result, rank);
      const domain = normalizeDomain(item.domain) || "unknown";
      const preference = domainPrefs[domain];
      const safeUrl = getSafeResultUrl(result);
      const title = safeUrl
        ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
        : `<span>${escapeHtml(item.title)}</span>`;
      const detailsId = `searchlens-details-${rank}`;
      const preferenceLabel = preference
        ? ({ promote: "已提升", demote: "已降低", hide: "已隐藏" } as const)[preference]
        : "未设置";
      const reasonDetailsHtml = showReasons
        ? `<div class="searchlens-detail-row"><dt>主要原因</dt><dd>${escapeHtml(item.topReason || "暂无主要原因")}</dd></div>
          <div class="searchlens-detail-row"><dt>规则命中</dt><dd class="searchlens-rule-list">${item.reasons.length > 0
            ? item.reasons.map(reason => `<span>${escapeHtml(reason.label)}</span>`).join("")
            : "暂无可展示规则"}</dd></div>`
        : `<div class="searchlens-detail-row"><dt>评分理由</dt><dd>已在设置中关闭</dd></div>`;
      const scoreHtml = showConfidence
        ? `<div class="searchlens-score ${item.scoreBarClass}" title="可信度分数 ${item.score}">
            <strong>${item.score}</strong><span>可信度参考</span>
          </div>`
        : "";
      const confidenceDetailsHtml = showConfidence
        ? `<div class="searchlens-detail-row"><dt>参考等级</dt><dd>${escapeHtml(item.confidenceLabel)}</dd></div>`
        : "";
      const warningDetailsHtml = warnThirdPartyDownloadSites && result.detectedType === "third_party_download_site"
        ? `<div class="searchlens-detail-warning">第三方下载站提示：建议优先核对软件官网或官方应用商店。</div>`
        : "";

      return `<article class="searchlens-card" data-domain="${escapeHtml(domain)}">
        <div class="searchlens-rank" title="推荐序号">${rank}</div>
        <div class="searchlens-card-main">
          <div class="searchlens-title-row">
            <h3 class="searchlens-title">${title}</h3>
            <span class="searchlens-inline-domain" title="${escapeHtml(getSourceLabel(result))}">${escapeHtml(getSourceLabel(result))}</span>
            ${scoreHtml}
          </div>
          <div class="searchlens-tags">${renderCompactTags(result)}</div>
          <div class="searchlens-actions" aria-label="${escapeHtml(domain)} 的域名偏好">
            <div class="searchlens-pref-actions">
              ${renderPreferenceButton(domain, "promote", preference)}
              ${renderPreferenceButton(domain, "demote", preference)}
              ${renderPreferenceButton(domain, "hide", preference)}
            </div>
            <button class="searchlens-detail-toggle" type="button" data-detail-toggle aria-expanded="false" aria-controls="${detailsId}">查看原因</button>
          </div>
          <dl class="searchlens-details" id="${detailsId}" hidden>
            ${reasonDetailsHtml}
            ${confidenceDetailsHtml}
            <div class="searchlens-detail-row"><dt>百度原始排名</dt><dd>第 ${item.originalRank} 位</dd></div>
            <div class="searchlens-detail-row"><dt>用户偏好</dt><dd>${preferenceLabel}</dd></div>
            ${warningDetailsHtml}
          </dl>
        </div>
      </article>`;
    }

    function renderCompactTags(result: SearchResult): string {
      const tags: Array<{ label: string; className: string }> = [];
      const reasonCodes = new Set(result.reasons.map(reason => reason.code));
      const baiduLabels: Record<string, string> = {
        baidu_baike: "百度系 · 百科",
        baidu_zhidao: "百度系 · 知道",
        baidu_wenku: "百度系 · 文库",
        baidu_tieba: "百度系 · 贴吧",
        baijiahao: "百度系 · 百家号",
      };

      if (result.detectedType === "third_party_download_site") {
        tags.push({ label: "下载站风险", className: "tag-warning" });
      }
      if (result.isAdOrPromoted) tags.push({ label: "推广", className: "tag-ad" });

      if (reasonCodes.has("official_domain_match")) {
        tags.push({ label: "官网", className: "tag-official" });
      } else if (reasonCodes.has("official_domain_partial")) {
        tags.push({ label: "官方来源", className: "tag-official" });
      } else if (reasonCodes.has("high_trust_domain")) {
        tags.push({ label: "可信来源", className: "tag-trusted" });
      }

      if (baiduLabels[result.detectedType]) {
        tags.push({ label: baiduLabels[result.detectedType], className: "tag-baidu" });
      } else if (result.detectedType !== "unknown" && result.detectedType !== "ad_or_promoted" && result.detectedType !== "third_party_download_site") {
        tags.push({ label: toDisplayItem(result, 0).typeLabel, className: "tag-neutral" });
      }

      if (tags.length === 0) tags.push({ label: "其他来源", className: "tag-neutral" });

      return tags.slice(0, 2).map(tag =>
        `<span class="searchlens-type-tag ${tag.className}">${escapeHtml(tag.label)}</span>`
      ).join("");
    }

    function renderPreferenceButton(
      domain: string,
      action: "promote" | "demote" | "hide",
      current: DomainPrefMap[string] | undefined,
    ): string {
      const labels = { promote: "提升", demote: "降低", hide: "隐藏" } as const;
      const activeLabels = { promote: "已提升", demote: "已降低", hide: "已隐藏" } as const;
      const active = current === action;
      return `<button class="searchlens-pref-btn action-${action}${active ? " is-active" : ""}" type="button"
        data-domain="${escapeHtml(domain)}" data-pref-action="${action}" aria-pressed="${active}">
        ${active ? activeLabels[action] : labels[action]}
      </button>`;
    }

    async function setDomainPreference(
      button: HTMLButtonElement,
      domain: string,
      action: "promote" | "demote" | "hide",
    ): Promise<void> {
      const card = button.closest<HTMLElement>(".searchlens-card");
      const originalButtonText = button.textContent;
      card?.classList.add("is-saving");
      card?.querySelectorAll<HTMLButtonElement>(".searchlens-pref-btn").forEach(item => { item.disabled = true; });
      button.textContent = action === "hide" ? "正在隐藏…" : "保存中…";

      try {
        await browser.runtime.sendMessage({
          type: "SET_DOMAIN_PREFERENCE",
          payload: { domain, action },
        });
        if (action === "hide") {
          card?.classList.add("is-hiding");
          await new Promise<void>(resolve => window.setTimeout(resolve, 140));
        }
        domainPrefs[normalizeDomain(domain)] = action;
        refreshRecommendationsFromCurrentResults();
        const messages = {
          promote: `已提升 ${domain}，推荐顺序已刷新。`,
          demote: `已降低 ${domain}，推荐顺序已刷新。`,
          hide: `已隐藏 ${domain}，当前结果已移除。`,
        };
        showToast(messages[action], "success");
      } catch (err) {
        console.error("[SearchLens] Failed to set domain preference:", err);
        card?.classList.remove("is-saving");
        card?.querySelectorAll<HTMLButtonElement>(".searchlens-pref-btn").forEach(item => { item.disabled = false; });
        button.textContent = originalButtonText;
        showToast("偏好保存失败，请稍后重试。", "error");
      }
    }

    function refreshRecommendationsFromCurrentResults(): void {
      if (!lastOutput || lastOutput.pageKind !== "web_search") return;
      lastOutput = {
        ...lastOutput,
        recommendations: getRecommendations({
          query: lastOutput.query,
          results: lastOutput.results,
          domainPreferences: domainPrefs,
          limit: recommendationLimit,
        }),
      };
      renderPanel();
    }

    function showToast(message: string, type: "success" | "error"): void {
      const toast = panel?.querySelector<HTMLElement>(".searchlens-toast");
      if (!toast) return;
      if (toastTimer) clearTimeout(toastTimer);
      toast.textContent = message;
      toast.className = `searchlens-toast is-${type}`;
      toast.hidden = false;
      toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
    }

    function openOptions(): void {
      browser.runtime.sendMessage({ type: "OPEN_OPTIONS" }).catch((err) => {
        console.error("[SearchLens] Failed to open options:", err);
        showToast("设置页打开失败，请从扩展管理页进入。", "error");
      });
    }

    function getSourceLabel(result: SearchResult): string {
      const source = (result.displayUrl || result.domain || "unknown").trim();
      const normalized = source.toLowerCase();
      if (!source || normalized.startsWith("javascript:")) return "unknown";
      if (normalized === "www.baidu.com" || normalized === "baidu.com") return "unknown";
      return source;
    }

    function getSafeResultUrl(result: SearchResult): string | undefined {
      const candidate = result.resolvedUrl || result.url;
      if (!candidate) return undefined;
      try {
        const url = new URL(candidate);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
      } catch {
        return undefined;
      }
    }

    function getCurrentQuery(): string {
      return document.querySelector<HTMLInputElement>("#kw")?.value?.trim() ?? "";
    }

    function logDiagnostics(output: ScoredAdapterOutput): void {
      const contentLeft = document.getElementById("content_left");
      const candidates = contentLeft
        ? Array.from(contentLeft.querySelectorAll(RESULT_CONTAINER_SELECTOR)).filter(node => !node.closest("#searchlens-panel")).length
        : 0;
      const topDomains = [...new Set(output.results.map(result => result.domain).filter(Boolean))].slice(0, 5);
      console.log("[SearchLens] Adapter diagnostics:", {
        query: output.query,
        candidateCount: candidates,
        acceptedCount: output.results.length,
        topDomains,
      });
    }

    async function refreshFromPage(showLoading = false): Promise<void> {
      if (dismissed || !isWebSearchTab()) {
        removePanel();
        return;
      }

      const storageFailed = await loadPreferences();
      if (!enabled || dismissed) {
        removePanel();
        return;
      }

      if (!insertPanel()) return;
      if (showLoading) renderLoading();

      const output = runScoredAdapter(document, domainPrefs, recommendationLimit);
      lastOutput = output;
      logDiagnostics(output);

      if (output.pageKind !== "web_search") {
        removePanel();
        return;
      }

      renderPanel();
      if (storageFailed) showToast("部分本地设置读取失败，本次使用默认值。", "error");
    }

    function escapeHtml(value: string): string {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    void loadPreferences().then(() => {
      if (!enabled || dismissed || !isWebSearchTab()) return;
      if (insertPanel()) renderLoading();
      waitForStableDom(() => { void refreshFromPage(); });
    });

    const tabObserver = new MutationObserver(() => {
      if (!isWebSearchTab()) removePanel();
      else if (!panel && !dismissed) void refreshFromPage(true);
    });
    const tabBar = document.querySelector("#s_tab, .s_tab");
    if (tabBar) {
      tabObserver.observe(tabBar, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class"],
        childList: true,
      });
    }

    let observedContentLeft: HTMLElement | null = null;
    let contentObserver: MutationObserver | null = null;

    function scheduleRefresh(): void {
      if (dismissed) return;
      if (domSettleTimer) clearTimeout(domSettleTimer);
      domSettleTimer = window.setTimeout(() => {
        domSettleTimer = undefined;
        void refreshFromPage();
      }, 600);
    }

    function mutationOnlyTouchesSearchLens(records: MutationRecord[]): boolean {
      const nodes = records.flatMap(record => [...record.addedNodes, ...record.removedNodes]);
      return nodes.length > 0 && nodes.every(node => {
        if (!(node instanceof Element)) return false;
        return node.id === "searchlens-panel" || node.matches('[data-searchlens-root="true"]');
      });
    }

    function observeContentLeft(): void {
      const currentContentLeft = document.getElementById("content_left");
      if (currentContentLeft === observedContentLeft) return;

      contentObserver?.disconnect();
      observedContentLeft = currentContentLeft;
      if (panel && !document.contains(panel)) panel = null;
      if (!currentContentLeft) return;

      contentObserver = new MutationObserver(records => {
        if (mutationOnlyTouchesSearchLens(records)) return;
        if (panel && !document.contains(panel)) panel = null;
        scheduleRefresh();
      });
      contentObserver.observe(currentContentLeft, { childList: true, subtree: false });
    }

    observeContentLeft();
    new MutationObserver(observeContentLeft).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});
