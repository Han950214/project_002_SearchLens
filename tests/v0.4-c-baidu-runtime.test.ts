import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';

type RuntimeMessage = { type: string; payload?: { domain?: string; action?: 'promote' | 'demote' | 'hide' } };
type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void };
type QueuedReply = { gate: Deferred; fail?: boolean; value?: unknown };

const FIXTURE = resolve(process.cwd(), 'tests/fixtures/baidu-runtime-dynamic.html');
const RESULT_SELECTOR = 'div.c-container, div.ec_result, div.ec_wise_ad, div.result-op';
const nodeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nodeClearTimeout = globalThis.clearTimeout.bind(globalThis);
type TimerHandle = ReturnType<typeof nodeSetTimeout>;
let activeWindowTimers = new Set<TimerHandle>();

function defer(): Deferred {
  let resolveGate!: () => void;
  let rejectGate!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveGate = resolve;
    rejectGate = reject;
  });
  return { promise, resolve: resolveGate, reject: rejectGate };
}

class BrowserMock {
  readonly messages: RuntimeMessage[] = [];
  readonly domainReplies: QueuedReply[] = [];
  readonly settingsReplies: QueuedReply[] = [];
  prefs: Record<string, 'promote' | 'demote' | 'hide'> = {};
  settings = {
    enabled: true,
    recommendationLimit: 5,
    showConfidence: true,
    showReasons: true,
    warnThirdPartyDownloadSites: true,
  };

  queueDomainReply(fail = false, value?: Record<string, 'promote' | 'demote' | 'hide'>): Deferred {
    const gate = defer();
    this.domainReplies.push({ gate, fail, value });
    return gate;
  }

  queueSettingsReply(value: Partial<BrowserMock['settings']>, fail = false): Deferred {
    const gate = defer();
    this.settingsReplies.push({ gate, fail, value });
    return gate;
  }

  count(type: string): number {
    return this.messages.filter(message => message.type === type).length;
  }

  async sendMessage(message: RuntimeMessage): Promise<unknown> {
    this.messages.push(message);

    if (message.type === 'GET_DOMAIN_PREFERENCES') {
      const queued = this.domainReplies.shift();
      if (queued) {
        await queued.gate.promise;
        if (queued.fail) throw new Error('stale preference failure');
        if (queued.value !== undefined) return queued.value;
      }
      return { ...this.prefs };
    }

    if (message.type === 'GET_SETTINGS') {
      const queued = this.settingsReplies.shift();
      if (queued) {
        await queued.gate.promise;
        if (queued.fail) throw new Error('settings failure');
        if (queued.value !== undefined) return queued.value;
      }
      return { ...this.settings };
    }

    if (message.type === 'SET_DOMAIN_PREFERENCE') {
      const domain = message.payload?.domain;
      const action = message.payload?.action;
      if (domain && action) this.prefs[domain] = action;
      return undefined;
    }

    if (message.type === 'OPEN_OPTIONS') return undefined;
    throw new Error(`Unexpected message: ${message.type}`);
  }
}

function installDom(html = readFileSync(FIXTURE, 'utf8')): { document: Document; window: Window; browser: BrowserMock } {
  activeWindowTimers.forEach(timer => nodeClearTimeout(timer));
  const windowTimers = new Set<TimerHandle>();
  activeWindowTimers = windowTimers;
  const { document, window } = parseHTML(html);
  const browser = new BrowserMock();

  Object.defineProperty(document, 'URL', {
    value: 'https://www.baidu.com/s?wd=%E5%BE%AE%E4%BF%A1%E5%AE%98%E7%BD%91',
    configurable: true,
  });

  (window as any).setTimeout = (handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => {
    let timer!: TimerHandle;
    timer = nodeSetTimeout(() => {
      windowTimers.delete(timer);
      handler(...args);
    }, timeout);
    windowTimers.add(timer);
    if ((timeout ?? 0) > 1000 && typeof timer === 'object' && 'unref' in timer) timer.unref();
    return timer;
  };
  (window as any).clearTimeout = (timer: TimerHandle) => {
    windowTimers.delete(timer);
    nodeClearTimeout(timer);
  };
  (window as any).getComputedStyle = (element: Element) => ({
    getPropertyValue: () => '',
    display: element.getAttribute('hidden') === '' ? 'none' : '',
    visibility: 'visible',
    opacity: '1',
  });
  (window.Element.prototype as any).getBoundingClientRect = function getBoundingClientRect() {
    if (this.matches?.(RESULT_SELECTOR)) {
      return { x: 0, y: 0, bottom: 100, height: 80, left: 0, right: 800, top: 0, width: 800, toJSON() { return this; } };
    }
    return { x: 0, y: 0, bottom: 1, height: 1, left: 0, right: 1, top: 0, width: 1, toJSON() { return this; } };
  };

  (globalThis as any).window = window;
  (globalThis as any).document = document;
  (globalThis as any).browser = { runtime: { sendMessage: browser.sendMessage.bind(browser) } };
  (globalThis as any).MutationObserver = (window as any).MutationObserver;
  (globalThis as any).Element = window.Element;
  (globalThis as any).HTMLElement = (window as any).HTMLElement;
  (globalThis as any).HTMLInputElement = (window as any).HTMLInputElement;
  (globalThis as any).Node = window.Node;
  (globalThis as any).Event = window.Event;
  (globalThis as any).getComputedStyle = (window as any).getComputedStyle;

  return { document: document as unknown as Document, window: window as unknown as Window, browser };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, label: string, timeoutMs = 1200): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await delay(20);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function setQuery(document: Document, window: Window, value: string): void {
  const input = document.querySelector<HTMLInputElement>('#kw');
  assert.ok(input);
  input.value = value;
  input.dispatchEvent(new (window as any).Event('input', { bubbles: true }));
}

function replacePrimaryResult(document: Document, title: string, url: string, displayUrl: string): void {
  const primary = document.querySelector<HTMLElement>('[data-testid="primary"]');
  assert.ok(primary);
  primary.innerHTML = `<h3 class="t"><a href="${url}">${title}</a></h3>
    <span class="c-showurl">${displayUrl}</span>
    <span class="c-abstract">${title} current page result.</span>`;
}

function panel(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>('#searchlens-panel');
}

function panelText(document: Document): string {
  return panel(document)?.textContent ?? '';
}

(globalThis as any).defineContentScript = (config: unknown) => config;
const contentScript = (await import('../entrypoints/baidu.content/index')).default as { main: () => void };

async function startRuntime(document: Document, duplicate = false): Promise<void> {
  contentScript.main();
  if (duplicate) contentScript.main();
  await waitUntil(() => Boolean(panel(document)), 'initial panel insertion');
  await waitUntil(() => panelText(document).includes('微信官网'), 'initial render');
}

async function testDuplicateInitializationDebounceAndSelfMutation(): Promise<void> {
  const { document, browser } = installDom();
  await startRuntime(document, true);

  assert.equal(document.querySelectorAll('#searchlens-panel').length, 1);
  assert.equal(browser.count('GET_DOMAIN_PREFERENCES'), 2);
  assert.equal(browser.count('GET_SETTINGS'), 2);

  const promoteButton = document.querySelector<HTMLButtonElement>('#searchlens-panel button[data-pref-action="promote"]');
  assert.ok(promoteButton);
  promoteButton.click();
  await delay(80);
  assert.equal(browser.count('SET_DOMAIN_PREFERENCE'), 1);

  const beforeSelfMutationGets = browser.count('GET_DOMAIN_PREFERENCES');
  document.querySelector<HTMLButtonElement>('#searchlens-panel button[data-detail-toggle]')?.click();
  const toast = document.querySelector<HTMLElement>('#searchlens-panel .searchlens-toast');
  assert.ok(toast);
  toast.hidden = false;
  toast.textContent = 'local feedback';
  toast.hidden = true;
  await delay(260);
  assert.equal(browser.count('GET_DOMAIN_PREFERENCES'), beforeSelfMutationGets);

  const beforeBurstGets = browser.count('GET_DOMAIN_PREFERENCES');
  const beforeBurstSettings = browser.count('GET_SETTINGS');
  const title = document.querySelector('[data-testid="primary"] h3 a');
  const snippet = document.querySelector('[data-testid="primary"] .c-abstract');
  assert.ok(title);
  assert.ok(snippet);
  title.textContent = '微信官网动态更新';
  title.setAttribute('href', 'https://weixin.qq.com/dynamic');
  snippet.textContent = 'nested snippet update';
  replacePrimaryResult(document, '微信官网动态最终结果', 'https://weixin.qq.com/final', 'weixin.qq.com/final');

  await waitUntil(
    () => panelText(document).includes('微信官网动态最终结果'),
    'debounced nested mutation render',
  );
  assert.equal(browser.count('GET_DOMAIN_PREFERENCES'), beforeBurstGets + 1);
  assert.equal(browser.count('GET_SETTINGS'), beforeBurstSettings + 1);
  assert.equal(document.querySelectorAll('#searchlens-panel').length, 1);
}

async function testContentLeftReplacementAndQueryChange(): Promise<void> {
  const { document, window, browser } = installDom();
  await startRuntime(document);

  const oldContentLeft = document.getElementById('content_left');
  assert.ok(oldContentLeft);

  setQuery(document, window, 'QQ 下载');
  const replacement = document.createElement('div');
  replacement.id = 'content_left';
  replacement.innerHTML = `<div class="c-container" data-testid="replacement">
    <h3 class="t"><a href="https://im.qq.com/">QQ 下载官网</a></h3>
    <span class="c-showurl">im.qq.com</span>
    <span class="c-abstract">QQ current download page.</span>
  </div>`;
  oldContentLeft.replaceWith(replacement);

  await waitUntil(() => panelText(document).includes('QQ 下载'), 'replacement query header');
  await waitUntil(() => panelText(document).includes('QQ 下载官网'), 'replacement result render');
  assert.equal(document.querySelectorAll('#searchlens-panel').length, 1);

  const afterReplacementGets = browser.count('GET_DOMAIN_PREFERENCES');
  oldContentLeft.appendChild(document.createElement('div')).className = 'c-container';
  await delay(260);
  assert.equal(browser.count('GET_DOMAIN_PREFERENCES'), afterReplacementGets);
}

async function testStaleRefreshCannotRenderOrShowToast(): Promise<void> {
  const { document, window, browser } = installDom();
  await startRuntime(document);

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const staleGate = browser.queueDomainReply(true);
    const initialGets = browser.count('GET_DOMAIN_PREFERENCES');
    const initialSettings = browser.count('GET_SETTINGS');
    replacePrimaryResult(document, '微信官网慢刷新', 'https://weixin.qq.com/slow', 'weixin.qq.com/slow');
    await waitUntil(() => browser.count('GET_DOMAIN_PREFERENCES') === initialGets + 1, 'stale refresh start');

    setQuery(document, window, 'QQ 下载');
    replacePrimaryResult(document, 'QQ 下载官网', 'https://im.qq.com/', 'im.qq.com');
    await waitUntil(() => browser.count('GET_DOMAIN_PREFERENCES') === initialGets + 2, 'new refresh start');
    await waitUntil(() => panelText(document).includes('QQ 下载官网'), 'new refresh render');

    staleGate.resolve();
    await waitUntil(() => browser.count('GET_SETTINGS') === initialSettings + 2, 'stale refresh completion');
    await delay(40);

    assert.ok(panelText(document).includes('QQ 下载'));
    assert.ok(panelText(document).includes('QQ 下载官网'));
    assert.ok(!panelText(document).includes('微信官网慢刷新'));
    const toast = document.querySelector<HTMLElement>('#searchlens-panel .searchlens-toast');
    assert.ok(toast?.hidden);
  } finally {
    console.warn = originalWarn;
  }
}

async function testStaleBootstrapCannotOverwriteNewRefresh(): Promise<void> {
  const { document, window, browser } = installDom();
  const bootstrapGate = browser.queueDomainReply();

  contentScript.main();
  await waitUntil(() => browser.count('GET_DOMAIN_PREFERENCES') === 1, 'bootstrap preference read');

  setQuery(document, window, 'QQ 下载');
  replacePrimaryResult(document, 'QQ 下载官网', 'https://im.qq.com/', 'im.qq.com');
  await waitUntil(() => browser.count('GET_DOMAIN_PREFERENCES') === 2, 'new refresh start');
  await waitUntil(() => panelText(document).includes('QQ 下载官网'), 'new refresh render before bootstrap');

  const getsBeforeBootstrapRelease = browser.count('GET_DOMAIN_PREFERENCES');
  const settingsBeforeBootstrapRelease = browser.count('GET_SETTINGS');
  let staleLoadingObserved = false;
  const body = document.querySelector<HTMLElement>('#searchlens-body');
  assert.ok(body);
  const renderObserver = new MutationObserver(() => {
    if (panelText(document).includes('正在整理推荐结果')) staleLoadingObserved = true;
  });
  renderObserver.observe(body, { childList: true, subtree: true, characterData: true });

  bootstrapGate.resolve();
  await waitUntil(
    () => browser.count('GET_SETTINGS') === settingsBeforeBootstrapRelease + 1,
    'stale bootstrap preference completion',
  );
  await delay(1000);
  renderObserver.disconnect();

  assert.ok(panelText(document).includes('QQ 下载'));
  assert.ok(panelText(document).includes('QQ 下载官网'));
  assert.ok(!panelText(document).includes('微信官网'));
  assert.equal(staleLoadingObserved, false);
  assert.equal(browser.count('GET_DOMAIN_PREFERENCES'), getsBeforeBootstrapRelease);
  assert.equal(document.querySelectorAll('#searchlens-panel').length, 1);
  const toast = document.querySelector<HTMLElement>('#searchlens-panel .searchlens-toast');
  assert.ok(toast?.hidden);
}

async function testStaleBootstrapCannotApplyPreferences(): Promise<void> {
  const { document, window, browser } = installDom();
  const bootstrapGate = browser.queueDomainReply(false, { 'im.qq.com': 'hide' });
  const currentSettingsGate = browser.queueSettingsReply({ ...browser.settings });
  const staleSettingsGate = browser.queueSettingsReply({ ...browser.settings, enabled: false });
  currentSettingsGate.resolve();
  staleSettingsGate.resolve();

  contentScript.main();
  await waitUntil(() => browser.count('GET_DOMAIN_PREFERENCES') === 1, 'bootstrap preference read for stale apply');

  setQuery(document, window, 'QQ 下载');
  replacePrimaryResult(document, 'QQ 下载官网', 'https://im.qq.com/', 'im.qq.com');
  await waitUntil(() => panelText(document).includes('QQ 下载官网'), 'new render before stale preference apply');

  bootstrapGate.resolve();
  await waitUntil(() => browser.count('GET_SETTINGS') === 2, 'stale bootstrap settings completion');
  await delay(0);

  const supportPromote = document.querySelector<HTMLButtonElement>(
    '#searchlens-panel .searchlens-card[data-domain="support.qq.com"] button[data-pref-action="promote"]',
  );
  assert.ok(supportPromote);
  const preferenceWrites = browser.count('SET_DOMAIN_PREFERENCE');
  supportPromote.click();
  await waitUntil(() => browser.count('SET_DOMAIN_PREFERENCE') === preferenceWrites + 1, 'preference rerender');
  await waitUntil(
    () => document.querySelector('#searchlens-panel .searchlens-toast')?.classList.contains('is-success') === true,
    'preference rerender completion',
  );
  await delay(260);

  assert.ok(panelText(document).includes('QQ 下载'));
  assert.ok(panelText(document).includes('QQ 下载官网'));
  assert.ok(!panelText(document).includes('微信官网'));
  assert.equal(document.querySelectorAll('#searchlens-panel').length, 1);
  const toast = document.querySelector<HTMLElement>('#searchlens-panel .searchlens-toast');
  assert.ok(!toast?.classList.contains('is-error'));
}

async function testTabSwitchAndDismissedPanel(): Promise<void> {
  const { document } = installDom();
  await startRuntime(document);

  const tabs = Array.from(document.querySelectorAll<HTMLElement>('#s_tab a'));
  assert.equal(tabs.length, 2);
  tabs[0].className = '';
  tabs[1].className = 'cur';
  await waitUntil(() => !panel(document), 'panel removed on unsupported tab');

  tabs[1].className = '';
  tabs[0].className = 'cur';
  await waitUntil(() => document.querySelectorAll('#searchlens-panel').length === 1, 'panel restored on web tab');
  await waitUntil(() => panelText(document).includes('微信官网'), 'panel rerendered after web tab restore');

  document.querySelector<HTMLButtonElement>('#searchlens-panel .searchlens-close-btn')?.click();
  await waitUntil(() => !panel(document), 'panel dismissed by user');
  replacePrimaryResult(document, '微信官网关闭后更新', 'https://weixin.qq.com/closed', 'weixin.qq.com/closed');
  await delay(260);
  assert.equal(document.querySelectorAll('#searchlens-panel').length, 0);
}

await testDuplicateInitializationDebounceAndSelfMutation();
await testContentLeftReplacementAndQueryChange();
await testStaleRefreshCannotRenderOrShowToast();
await testStaleBootstrapCannotOverwriteNewRefresh();
await testTabSwitchAndDismissedPanel();
await testStaleBootstrapCannotApplyPreferences();

console.log('v0.4-C Baidu runtime lifecycle tests passed');
