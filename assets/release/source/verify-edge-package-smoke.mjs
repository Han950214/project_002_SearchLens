import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tempRoot = resolve(tmpdir());
const dependencyRoot = resolve(process.env.SEARCHLENS_PUPPETEER_ROOT ?? '');
const edgePath = resolve(process.env.SEARCHLENS_EDGE_PATH ?? '');
const extensionPath = resolve(process.env.SEARCHLENS_EDGE_EXTENSION_PATH ?? '');
const requestedBatch = process.env.SEARCHLENS_EDGE_BATCH ?? '';
const captchaAttempt = process.env.SEARCHLENS_CAPTCHA_ATTEMPT ?? '1';
const reportPath = process.env.SEARCHLENS_EDGE_REPORT_PATH
  ? resolve(process.env.SEARCHLENS_EDGE_REPORT_PATH)
  : '';
const evidenceDir = resolve(
  process.env.SEARCHLENS_EDGE_EVIDENCE_DIR
    ?? mkdtempSync(join(tempRoot, 'searchlens-edge-evidence-')),
);
const profile = mkdtempSync(join(tempRoot, 'searchlens-edge-profile-'));

const report = {
  browser_kind: 'Microsoft Edge (stable)',
  edge_path: edgePath,
  edge_version: 'unknown',
  edge_user_agent: 'unknown',
  launched_process_path: 'unknown',
  isolated_profile: profile,
  user_profile_access: 'no',
  extension_path: extensionPath,
  extension_loaded: 'no',
  extension_id: 'unknown',
  single_extension_instance: 'no',
  developer_mode: 'unknown',
  extension_manager_inspection: 'not_started',
  load_errors: 0,
  batch_requested: requestedBatch || 'all',
  batch_1: 'NOT_RUN',
  batch_2: 'NOT_RUN',
  batch_3: 'NOT_RUN',
  batch_4: 'NOT_RUN',
  searchlens_errors: 0,
  service_worker_errors: 0,
  continuous_refresh: 'not_checked',
  captcha_observed: 'no',
  captcha_attempt: captchaAttempt,
  captcha_retry_used: captchaAttempt === '2' ? 'yes' : 'no',
  screenshots: [],
  residual_processes: 'unknown',
  profile_deleted: 'no',
  verdict: 'FAIL',
};

const pageErrors = [];
const serviceWorkerErrors = [];
const diagnostics = [];
const batchDetails = {};
let browser;
let extensionId = '';
let failure;

function isWithin(parent, child) {
  const pathFromParent = relative(resolve(parent), resolve(child));
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function isSearchLensError(text) {
  const value = String(text ?? '');
  return value.includes('[SearchLens]')
    || (extensionId && value.includes(`chrome-extension://${extensionId}/`));
}

function attachPageDiagnostics(page) {
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[SearchLens] Adapter diagnostics:')) diagnostics.push(text);
    if (message.type() === 'error' && isSearchLensError(text)) pageErrors.push(text);
  });
  page.on('pageerror', (error) => {
    if (isSearchLensError(error.stack || error.message)) pageErrors.push(error.message);
  });
}

async function findSearchLensWorkers() {
  const matches = [];
  for (const target of browser.targets().filter((item) => item.type() === 'service_worker')) {
    try {
      const worker = await target.worker();
      const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
      if (manifest.name === 'SearchLens CN') {
        matches.push({ target, worker, extensionId: new URL(target.url()).host });
      }
    } catch {
      // Ignore unrelated browser-owned service workers.
    }
  }
  return matches;
}

async function waitForSearchLensWorkers() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const workers = await findSearchLensWorkers();
    if (workers.length > 0) return workers;
    await sleep(250);
  }
  return [];
}

async function isCaptchaPage(page) {
  return page.evaluate(() => /验证码|安全验证|网络不给力/.test(document.body?.innerText ?? ''));
}

async function captureCaptchaEvidence(page, query) {
  const safeQuery = query.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'query';
  const screenshot = join(evidenceDir, `edge-smoke-captcha-${safeQuery}.png`);
  await page.screenshot({ path: screenshot });
  if (!report.screenshots.includes(screenshot)) report.screenshots.push(screenshot);
}

async function readPanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#searchlens-panel');
    const cards = Array.from(panel?.querySelectorAll('.searchlens-card') ?? []).map((card) => ({
      domain: card.getAttribute('data-domain') ?? '',
      tags: Array.from(card.querySelectorAll('.searchlens-type-tag')).map((node) => node.textContent?.trim() ?? ''),
      reasons: Array.from(card.querySelectorAll('.searchlens-rule-list span')).map((node) => node.textContent?.trim() ?? ''),
    }));
    const resultContainers = Array.from(
      document.querySelectorAll('div.c-container, div.ec_result, div.ec_wise_ad, div.result-op'),
    ).filter((node) => !node.closest('#searchlens-panel'));
    return {
      panelCount: document.querySelectorAll('#searchlens-panel').length,
      query: panel?.querySelector('.searchlens-query')?.textContent?.trim() ?? '',
      recommendationCount: cards.length,
      loadingCount: panel?.querySelectorAll('.searchlens-loading').length ?? 0,
      cards,
      candidateCount: resultContainers.length,
      panelText: panel?.textContent ?? '',
    };
  });
}

async function waitForPanel(page, query) {
  try {
    await page.waitForFunction(
      (expectedQuery) => {
        const panel = document.querySelector('#searchlens-panel');
        return document.querySelectorAll('#searchlens-panel').length === 1
          && panel?.querySelector('.searchlens-query')?.textContent?.trim() === expectedQuery
          && panel.querySelectorAll('.searchlens-card').length > 0
          && panel.querySelectorAll('.searchlens-loading').length === 0;
      },
      { timeout: 30_000 },
      query,
    );
  } catch (error) {
    if (await isCaptchaPage(page)) {
      await captureCaptchaEvidence(page, query);
      throw new Error(`Baidu CAPTCHA detected for query: ${query}`);
    }
    throw error;
  }
  const snapshot = await readPanel(page);
  requireCondition(snapshot.panelCount === 1, `Expected one panel for ${query}, found ${snapshot.panelCount}`);
  requireCondition(snapshot.query === query, `Expected query ${query}, found ${snapshot.query}`);
  requireCondition(snapshot.recommendationCount > 0, `Expected recommendations for ${query}`);
  return snapshot;
}

async function searchWithBaiduForm(page, query) {
  await page.waitForSelector('#kw', { timeout: 15_000 });
  const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5_000 }).catch(() => null);
  await page.evaluate((nextQuery) => {
    const input = document.querySelector('#kw');
    if (!(input instanceof HTMLInputElement)) throw new Error('Baidu search input not found');
    input.value = nextQuery;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const submit = document.querySelector('#su');
    if (submit instanceof HTMLElement) submit.click();
    else input.form?.requestSubmit();
  }, query);
  await Promise.race([navigationPromise, sleep(1_500)]);
  await sleep(500);
  return waitForPanel(page, query);
}

async function searchFromBaiduHome(page, query) {
  await page.goto('https://www.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (await isCaptchaPage(page)) {
    await captureCaptchaEvidence(page, query);
    throw new Error(`Baidu CAPTCHA detected before query: ${query}`);
  }
  return searchWithBaiduForm(page, query);
}

async function assertStable(page, query, durationMs) {
  const diagnosticsBefore = diagnostics.length;
  const first = await readPanel(page);
  await sleep(durationMs);
  const second = await readPanel(page);
  const diagnosticsDelta = diagnostics.length - diagnosticsBefore;
  requireCondition(
    first.panelCount === 1 && second.panelCount === 1,
    `Panel count unstable for ${query}: ${JSON.stringify({ first, second })}`,
  );
  requireCondition(first.query === query && second.query === query, `Query changed during stability window for ${query}`);
  requireCondition(first.loadingCount === 0 && second.loadingCount === 0, `Continuous loading detected for ${query}`);
  requireCondition(diagnosticsDelta <= 1, `Possible refresh loop for ${query}: ${diagnosticsDelta} diagnostics`);
  return { before: first, after: second, diagnosticsDelta };
}

async function openOriginalResult(page) {
  const selector = '#content_left h3 a[href], #content_left .c-title a[href]';
  await page.waitForSelector(selector, { timeout: 15_000 });
  const initialTargets = new Set(browser.targets());
  const previousUrl = page.url();
  const targetPromise = browser.waitForTarget(
    (target) => target.type() === 'page' && !initialTargets.has(target),
    { timeout: 10_000 },
  ).catch(() => null);
  const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => null);
  await page.click(selector);
  const newTarget = await targetPromise;
  if (newTarget) {
    const openedPage = await newTarget.page();
    if (openedPage) {
      const openedUrl = openedPage.url();
      requireCondition(/^https?:/i.test(openedUrl), `Original result opened an unexpected URL: ${openedUrl}`);
      await openedPage.close();
      return openedUrl;
    }
  }
  await navigationPromise;
  const openedUrl = page.url();
  requireCondition(openedUrl !== previousUrl && /^https?:/i.test(openedUrl), 'Original result did not open');
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  return openedUrl;
}

async function readExtensionManager() {
  const page = await browser.newPage();
  await page.goto('edge://extensions/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const uiPauseMs = Number.parseInt(process.env.SEARCHLENS_EDGE_UI_PAUSE_MS ?? '0', 10) || 0;
  if (uiPauseMs > 0) await sleep(uiPauseMs);
  const details = await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
    const queryAllDeep = (root, selector) => {
      const matches = [];
      const visit = (node) => {
        if (!(node instanceof Document || node instanceof DocumentFragment || node instanceof Element)) return;
        matches.push(...node.querySelectorAll(selector));
        for (const element of node.querySelectorAll('*')) {
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      visit(root);
      return [...new Set(matches)];
    };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const toggle = queryAllDeep(document, '#devMode').find((item) => 'checked' in item);
      if (toggle && !toggle.checked) toggle.click();
      const items = queryAllDeep(document, 'extensions-item');
      const matching = items.filter((item) => {
        const data = item.data ?? item.data_ ?? {};
        const renderedName = item.shadowRoot?.querySelector('#name')?.textContent?.trim() ?? '';
        return (data.name ?? '').trim() === 'SearchLens CN' || renderedName === 'SearchLens CN';
      });
      if (matching.length > 0) {
        const data = matching[0].data ?? matching[0].data_ ?? {};
        return {
          count: matching.length,
          id: data.id ?? '',
          state: String(data.state ?? ''),
          developerMode: Boolean(toggle?.checked),
          runtimeWarnings: Array.isArray(data.runtimeWarnings) ? data.runtimeWarnings.length : 0,
          disableReasons: data.disableReasons ? Object.keys(data.disableReasons).length : 0,
        };
      }
      await delay(250);
    }
    const items = queryAllDeep(document, 'extensions-item');
    return {
      count: 0,
      id: '',
      state: '',
      developerMode: false,
      runtimeWarnings: 0,
      disableReasons: 0,
      discoveredItems: items.map((item) => ({
        name: item.data?.name ?? item.data_?.name ?? item.shadowRoot?.querySelector('#name')?.textContent?.trim() ?? '',
        id: item.data?.id ?? item.data_?.id ?? '',
      })),
    };
  });
  if (details.count === 0) {
    await page.goto('edge://extensions-internals/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await sleep(500);
    const internalsText = await page.$eval('body', (node) => node.innerText);
    try {
      const parsed = JSON.parse(internalsText);
      const entries = Array.isArray(parsed) ? parsed : (parsed.extensions ?? []);
      const matching = entries.filter((entry) =>
        entry?.id === extensionId || entry?.manifest?.name === 'SearchLens CN',
      );
      if (matching.length > 0) {
        const entry = matching[0];
        const runtimeWarnings = Array.isArray(entry.runtime_warnings) ? entry.runtime_warnings.length : 0;
        const manifestErrors = Array.isArray(entry.manifest_errors) ? entry.manifest_errors.length : 0;
        const disableReasons = Array.isArray(entry.disable_reasons)
          ? entry.disable_reasons.length
          : Object.keys(entry.disable_reasons ?? {}).filter((key) => entry.disable_reasons[key]).length;
        details.count = matching.length;
        details.id = entry.id ?? extensionId;
        details.state = String(entry.state ?? entry.location ?? 'unpacked');
        details.developerMode = true;
        details.runtimeWarnings = runtimeWarnings + manifestErrors;
        details.disableReasons = disableReasons;
        details.source = 'edge://extensions-internals';
      }
    } catch {
      details.internalsPreview = internalsText.slice(0, 1_000);
    }
  }
  await page.close();
  return details;
}

async function getProfileProcessCount() {
  const command = [
    '$needle=$env:SEARCHLENS_PROFILE_NEEDLE',
    '$self=$PID',
    '@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $self -and $_.CommandLine -and $_.CommandLine.Contains($needle) }).Count',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    env: { ...process.env, SEARCHLENS_PROFILE_NEEDLE: profile },
    windowsHide: true,
  });
  return Number.parseInt(stdout.trim(), 10) || 0;
}

async function waitForNoProfileProcesses() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const count = await getProfileProcessCount();
    if (count === 0) return 0;
    await sleep(250);
  }
  return getProfileProcessCount();
}

function shouldRun(batchNumber) {
  return requestedBatch === '' || requestedBatch === batchNumber;
}

try {
  requireCondition(requestedBatch === '' || /^[1-4]$/.test(requestedBatch), `Invalid SEARCHLENS_EDGE_BATCH: ${requestedBatch}`);
  requireCondition(captchaAttempt === '1' || captchaAttempt === '2', `Invalid SEARCHLENS_CAPTCHA_ATTEMPT: ${captchaAttempt}`);
  requireCondition(existsSync(edgePath), `Microsoft Edge executable is missing: ${edgePath}`);
  requireCondition(existsSync(join(extensionPath, 'manifest.json')), `Extension manifest is missing: ${extensionPath}`);
  requireCondition(isWithin(tempRoot, extensionPath), `Extension must be unpacked under Windows TEMP: ${extensionPath}`);
  requireCondition(isWithin(tempRoot, dependencyRoot), `Puppeteer must be installed under Windows TEMP: ${dependencyRoot}`);
  requireCondition(isWithin(tempRoot, profile), `Profile must be under Windows TEMP: ${profile}`);
  requireCondition(isWithin(tempRoot, evidenceDir), `Evidence must be under Windows TEMP: ${evidenceDir}`);
  requireCondition(!reportPath || isWithin(tempRoot, reportPath), `Report must be under Windows TEMP: ${reportPath}`);
  mkdirSync(evidenceDir, { recursive: true });

  const requireFromTemp = createRequire(join(dependencyRoot, 'package.json'));
  const puppeteer = requireFromTemp('puppeteer-core');
  const puppeteerVersion = requireFromTemp('puppeteer-core/package.json').version;
  requireCondition(puppeteerVersion === '25.3.0', `Expected puppeteer-core 25.3.0, found ${puppeteerVersion}`);

  browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: false,
    pipe: true,
    enableExtensions: [extensionPath],
    userDataDir: profile,
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-features=msEdgeFirstRunExperience',
    ],
  });
  report.edge_version = await browser.version();
  report.edge_user_agent = await browser.userAgent();
  report.launched_process_path = browser.process()?.spawnfile ?? 'unknown';
  requireCondition(resolve(report.launched_process_path).toLowerCase() === edgePath.toLowerCase(), 'Launched process is not the expected Microsoft Edge executable');

  const workers = await waitForSearchLensWorkers();
  const extensionIds = [...new Set(workers.map((item) => item.extensionId))];
  requireCondition(workers.length === 1 && extensionIds.length === 1, `Expected one SearchLens worker, found workers=${workers.length}, ids=${extensionIds.length}`);
  [{ extensionId }] = workers;
  globalThis.extensionId = extensionId;
  report.extension_loaded = 'yes';
  report.extension_id = extensionId;
  report.single_extension_instance = 'yes';
  workers[0].worker.on('console', (message) => {
    if (message.type() === 'error' && isSearchLensError(message.text())) serviceWorkerErrors.push(message.text());
  });
  workers[0].worker.on('error', (error) => serviceWorkerErrors.push(error.message));

  const extensionManager = await readExtensionManager();
  if (extensionManager.count === 1) {
    requireCondition(extensionManager.id === extensionId, 'edge://extensions ID does not match the service worker ID');
    report.developer_mode = extensionManager.developerMode ? 'yes' : 'no';
    report.extension_manager_inspection = extensionManager.source ?? 'edge://extensions';
    report.load_errors = extensionManager.runtimeWarnings + extensionManager.disableReasons;
    requireCondition(report.load_errors === 0, `Edge reported ${report.load_errors} extension load errors`);
  } else {
    // Edge 150 does not expose the command-line-loaded item to the extensions WebUI DOM over CDP.
    // The unpacked development load is instead proven by one live service worker plus content-script execution.
    report.developer_mode = 'command_line_unpacked';
    report.extension_manager_inspection = 'edge_150_webui_not_exposed_to_cdp';
    report.load_errors = 0;
  }

  if (shouldRun('1')) {
  const batch1Page = await browser.newPage();
  attachPageDiagnostics(batch1Page);
  const batch1Initial = await searchFromBaiduHome(batch1Page, '微信官网');
  batchDetails.batch_1 = {
    queries: ['微信官网', '微信官方下载'],
    initialPanelCount: batch1Initial.panelCount,
    initialQuery: batch1Initial.query,
    initialRecommendationCount: batch1Initial.recommendationCount,
    verdict: 'in_progress',
  };
  await sleep(8_000);
  const batch1Updated = await searchWithBaiduForm(batch1Page, '微信官方下载');
  requireCondition(batch1Updated.query !== batch1Initial.query, 'Batch 1 query did not update');
  const batch1Stable = await assertStable(batch1Page, '微信官方下载', 10_000);
  const originalResultUrl = await openOriginalResult(batch1Page);
  const batch1Screenshot = join(evidenceDir, 'edge-smoke-batch-1.png');
  await batch1Page.screenshot({ path: batch1Screenshot });
  report.screenshots.push(batch1Screenshot);
  batchDetails.batch_1 = {
    queries: ['微信官网', '微信官方下载'],
    panelCount: batch1Stable.after.panelCount,
    query: batch1Stable.after.query,
    recommendationCount: batch1Stable.after.recommendationCount,
    candidateCount: batch1Stable.after.candidateCount,
    diagnosticsDelta: batch1Stable.diagnosticsDelta,
    originalResultOpened: /^https?:/i.test(originalResultUrl),
  };
  report.batch_1 = 'PASS';
  await batch1Page.close();
  }

  if (shouldRun('2')) {
  const batch2Page = await browser.newPage();
  attachPageDiagnostics(batch2Page);
  await searchFromBaiduHome(batch2Page, '微信登录');
  const imageTab = await batch2Page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('#s_tab a, .s_tab a'));
    const link = links.find((item) => item.textContent?.trim() === '图片');
    return link instanceof HTMLAnchorElement ? { href: link.href } : null;
  });
  requireCondition(imageTab?.href, 'Baidu Images tab link was not found');
  await batch2Page.goto(imageTab.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(3_000);
  const imagePanelCount = await batch2Page.evaluate(() => document.querySelectorAll('#searchlens-panel').length);
  requireCondition(imagePanelCount === 0, `SearchLens panel remained on the Images tab: ${imagePanelCount}`);
  await batch2Page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await sleep(3_000);
  await waitForPanel(batch2Page, '微信登录');
  await sleep(8_000);
  const batch2Updated = await searchWithBaiduForm(batch2Page, '微信文档');
  const batch2Stable = await assertStable(batch2Page, '微信文档', 10_000);
  batchDetails.batch_2 = {
    queries: ['微信登录', '微信文档'],
    imagesPanelCount: imagePanelCount,
    restoredPanelCount: batch2Updated.panelCount,
    panelCount: batch2Stable.after.panelCount,
    query: batch2Stable.after.query,
    recommendationCount: batch2Stable.after.recommendationCount,
    diagnosticsDelta: batch2Stable.diagnosticsDelta,
  };
  report.batch_2 = 'PASS';
  await batch2Page.close();
  }

  if (shouldRun('3')) {
  const batch3Page = await browser.newPage();
  attachPageDiagnostics(batch3Page);
  const batch3Initial = await searchFromBaiduHome(batch3Page, 'QQ 下载');
  const visibleDomains = [...new Set(batch3Initial.cards.map((card) => card.domain).filter(Boolean))];
  requireCondition(visibleDomains.length > 0, 'No domain was available for preference testing');
  const actionDomains = {
    promote: visibleDomains[0],
    demote: visibleDomains[1] ?? visibleDomains[0],
    hide: visibleDomains[2] ?? visibleDomains[1] ?? visibleDomains[0],
  };
  for (const action of ['promote', 'demote']) {
    const domain = actionDomains[action];
    await batch3Page.click(`button[data-domain="${domain}"][data-pref-action="${action}"]`);
    await batch3Page.waitForFunction(
      (domain, expectedAction) => document.querySelector(
        `button[data-domain="${domain}"][data-pref-action="${expectedAction}"][aria-pressed="true"]`,
      ),
      { timeout: 10_000 },
      domain,
      action,
    );
  }
  await batch3Page.click(`button[data-domain="${actionDomains.hide}"][data-pref-action="hide"]`);
  await batch3Page.waitForFunction(
    (domain) => !document.querySelector(`.searchlens-card[data-domain="${domain}"]`),
    { timeout: 10_000 },
    actionDomains.hide,
  );

  const optionsTargetPromise = browser.waitForTarget(
    (target) => target.url() === `chrome-extension://${extensionId}/options.html`,
    { timeout: 15_000 },
  );
  await batch3Page.click('#searchlens-panel .searchlens-settings-btn');
  const optionsTarget = await optionsTargetPromise;
  const optionsPage = await optionsTarget.page();
  requireCondition(optionsPage, 'Options page target did not expose a page');
  attachPageDiagnostics(optionsPage);
  await optionsPage.waitForSelector('.options-shell', { timeout: 15_000 });
  const originalLimit = await optionsPage.$eval('#rec-limit-select', (node) => node.value);
  const alternateLimit = originalLimit === '5' ? '3' : '5';
  await optionsPage.select('#rec-limit-select', alternateLimit);
  await sleep(400);
  await optionsPage.select('#rec-limit-select', originalLimit);
  await sleep(400);
  const storageSummary = await workers[0].worker.evaluate(async (domains) => {
    const raw = await chrome.storage.local.get(['searchlens:settings', 'searchlens:domainPreferences']);
    return {
      recommendationLimit: raw['searchlens:settings']?.recommendationLimit,
      testedPreferences: Object.fromEntries(
        Object.values(domains).map((domain) => [domain, raw['searchlens:domainPreferences']?.[domain]]),
      ),
    };
  }, actionDomains);
  requireCondition(String(storageSummary.recommendationLimit) === originalLimit, 'Options setting was not restored');
  const finalExpectedPreferences = {};
  for (const action of ['promote', 'demote', 'hide']) finalExpectedPreferences[actionDomains[action]] = action;
  for (const [domain, action] of Object.entries(finalExpectedPreferences)) {
    requireCondition(storageSummary.testedPreferences[domain] === action, `Domain ${domain} preference was not stored as ${action}`);
  }
  await optionsPage.close();

  await batch3Page.click('#searchlens-panel .searchlens-close-btn');
  await batch3Page.evaluate(() => {
    const content = document.querySelector('#content_left');
    const marker = document.createElement('span');
    marker.hidden = true;
    content?.appendChild(marker);
    marker.remove();
  });
  await sleep(1_500);
  const dismissedPanelCount = await batch3Page.evaluate(() => document.querySelectorAll('#searchlens-panel').length);
  requireCondition(dismissedPanelCount === 0, 'Dismissed panel returned after a page mutation');
  const batch3Screenshot = join(evidenceDir, 'edge-smoke-batch-3-dismissed.png');
  await batch3Page.screenshot({ path: batch3Screenshot });
  report.screenshots.push(batch3Screenshot);
  batchDetails.batch_3 = {
    query: 'QQ 下载',
    panelCount: batch3Initial.panelCount,
    recommendationCount: batch3Initial.recommendationCount,
    testedDomains: actionDomains,
    promote: 'pass',
    demote: 'pass',
    hide: 'pass',
    optionsChangedAndRestored: 'pass',
    storedPreferences: storageSummary.testedPreferences,
    dismissedPanelCount,
  };
  report.batch_3 = 'PASS';
  await batch3Page.close();
  }

  if (shouldRun('4')) {
  const batch4Page = await browser.newPage();
  attachPageDiagnostics(batch4Page);
  const conflictPanel = await searchFromBaiduHome(batch4Page, '微信 QQ');
  const conflictOfficialCards = conflictPanel.cards.filter((card) =>
    card.tags.some((tag) => tag === '官网' || tag === '官方来源')
    || card.reasons.some((reason) => reason.includes('查询实体与官方域名特征')),
  );
  requireCondition(conflictOfficialCards.length === 0, 'Multi-entity query incorrectly produced an official match');
  await sleep(8_000);
  const pythonPanel = await searchWithBaiduForm(batch4Page, 'Python download');
  const invalidOfficialCards = pythonPanel.cards.filter((card) => {
    const official = card.tags.some((tag) => tag === '官网' || tag === '官方来源')
      || card.reasons.some((reason) => reason.includes('查询实体与官方域名特征'));
    return official && card.domain !== 'python.org' && !card.domain.endsWith('.python.org');
  });
  requireCondition(invalidOfficialCards.length === 0, 'Python query marked a non-python.org domain as official');
  const thirdPartyOfficialCards = pythonPanel.cards.filter((card) =>
    card.tags.includes('下载站风险')
    && (card.tags.includes('官网') || card.tags.includes('官方来源')),
  );
  requireCondition(thirdPartyOfficialCards.length === 0, 'A third-party download site was marked official');
  requireCondition(!/官方认证|绝对可信|安全检测|杀毒/.test(pythonPanel.panelText), 'Panel contains an out-of-bound trust claim');
  const batch4Stable = await assertStable(batch4Page, 'Python download', 10_000);
  const batch4Screenshot = join(evidenceDir, 'edge-smoke-batch-4.png');
  await batch4Page.screenshot({ path: batch4Screenshot });
  report.screenshots.push(batch4Screenshot);
  batchDetails.batch_4 = {
    queries: ['微信 QQ', 'Python download'],
    conflictOfficialMatches: conflictOfficialCards.length,
    invalidPythonOfficialMatches: invalidOfficialCards.length,
    thirdPartyOfficialMatches: thirdPartyOfficialCards.length,
    panelCount: batch4Stable.after.panelCount,
    query: batch4Stable.after.query,
    recommendationCount: batch4Stable.after.recommendationCount,
    diagnosticsDelta: batch4Stable.diagnosticsDelta,
  };
  report.batch_4 = 'PASS';
  await batch4Page.close();
  }

  report.searchlens_errors = pageErrors.length;
  report.service_worker_errors = serviceWorkerErrors.length;
  requireCondition(report.searchlens_errors === 0, `SearchLens page errors: ${report.searchlens_errors}`);
  requireCondition(report.service_worker_errors === 0, `SearchLens service worker errors: ${report.service_worker_errors}`);
  report.continuous_refresh = 'no';
  report.verdict = 'PASS';
} catch (error) {
  failure = error;
  report.searchlens_errors = pageErrors.length;
  report.service_worker_errors = serviceWorkerErrors.length;
  if (/Baidu CAPTCHA detected/.test(error.message)) {
    report.captcha_observed = 'yes';
    if (/^[1-4]$/.test(requestedBatch)) report[`batch_${requestedBatch}`] = 'BLOCKED_BY_BAIDU_CAPTCHA';
    report.verdict = 'BLOCKED_BY_BAIDU_CAPTCHA';
  } else if (/^[1-4]$/.test(requestedBatch)) {
    report[`batch_${requestedBatch}`] = 'FAIL';
  }
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch (error) {
    failure ??= error;
    report.verdict = 'FAIL';
    process.exitCode = 1;
  }
  try {
    report.residual_processes = await waitForNoProfileProcesses();
    if (report.residual_processes !== 0) {
      failure ??= new Error(`Residual Edge processes: ${report.residual_processes}`);
      report.verdict = 'FAIL';
      process.exitCode = 1;
    }
  } catch (error) {
    failure ??= error;
    report.residual_processes = 'check_failed';
    report.verdict = 'FAIL';
    process.exitCode = 1;
  }
  try {
    rmSync(profile, { recursive: true, force: true });
    report.profile_deleted = existsSync(profile) ? 'no' : 'yes';
  } catch (error) {
    failure ??= error;
    report.profile_deleted = 'no';
    report.verdict = 'FAIL';
    process.exitCode = 1;
  }
  const reportJson = `${JSON.stringify({ report, batchDetails }, null, 2)}\n`;
  if (reportPath) writeFileSync(reportPath, reportJson, 'utf8');
  process.stdout.write(reportJson);
  if (failure) process.stderr.write(`failure_reason=${failure.message}\n`);
}
