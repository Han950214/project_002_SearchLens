import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const extensionPath = join(projectRoot, '.output', 'chrome-mv3');
const tempRoot = resolve(tmpdir());
const profile = mkdtempSync(join(tempRoot, 'searchlens-package-smoke-'));
const dependencyRoot = process.env.SEARCHLENS_PUPPETEER_ROOT
  ? resolve(process.env.SEARCHLENS_PUPPETEER_ROOT)
  : '';
const expectedQuery = '微信官网';

const report = {
  browser_kind: 'not_started',
  browser_version: 'unknown',
  browser_path: 'unknown',
  isolated_profile: profile,
  extension_path: extensionPath,
  extension_loaded: 'no',
  extension_id: 'unknown',
  single_extension_instance: 'no',
  panel_count: 0,
  query: '',
  recommendation_count: 0,
  options_opened: 'no',
  searchlens_errors: 0,
  service_worker_errors: 0,
  residual_processes: 'unknown',
  verdict: 'FAIL',
};

let browser;
let failure;
const pageErrors = [];
const serviceWorkerErrors = [];

function isWithin(parent, child) {
  const pathFromParent = relative(resolve(parent), resolve(child));
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}

function isSearchLensError(text, extensionId = '') {
  const value = String(text ?? '');
  return value.includes('[SearchLens]') || (extensionId && value.includes(`chrome-extension://${extensionId}/`));
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const count = await getProfileProcessCount();
    if (count === 0) return 0;
    await sleep(250);
  }
  return getProfileProcessCount();
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const workers = await findSearchLensWorkers();
    if (workers.length > 0) return workers;
    await sleep(250);
  }
  return [];
}

try {
  if (!existsSync(join(extensionPath, 'manifest.json'))) {
    throw new Error(`Built extension is missing: ${extensionPath}`);
  }
  if (!dependencyRoot) {
    throw new Error('SEARCHLENS_PUPPETEER_ROOT must point to a temporary Puppeteer 25.3.0 installation.');
  }
  if (!isWithin(tempRoot, dependencyRoot)) {
    throw new Error(`Puppeteer must be installed under Windows TEMP: ${dependencyRoot}`);
  }

  const requireFromTemp = createRequire(join(dependencyRoot, 'package.json'));
  const puppeteer = requireFromTemp('puppeteer');
  const puppeteerVersion = requireFromTemp('puppeteer/package.json').version;
  if (puppeteerVersion !== '25.3.0') {
    throw new Error(`Expected Puppeteer 25.3.0, found ${puppeteerVersion}`);
  }

  const browserPath = resolve(await puppeteer.executablePath());
  report.browser_path = browserPath;
  if (!existsSync(browserPath) || !isWithin(tempRoot, browserPath)) {
    throw new Error(`Bundled Chrome for Testing must exist under Windows TEMP: ${browserPath}`);
  }
  if (/\\Google\\Chrome\\Application\\chrome\.exe$/i.test(browserPath)) {
    throw new Error(`Stable Chrome is forbidden for package smoke: ${browserPath}`);
  }

  browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: false,
    pipe: true,
    enableExtensions: [extensionPath],
    userDataDir: profile,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  report.browser_kind = 'Chrome for Testing (Puppeteer bundled)';
  report.browser_version = await browser.version();

  const workers = await waitForSearchLensWorkers();
  const extensionIds = [...new Set(workers.map(({ extensionId }) => extensionId))];
  if (extensionIds.length !== 1 || workers.length !== 1) {
    throw new Error(`Expected one SearchLens service worker, found workers=${workers.length}, ids=${extensionIds.length}`);
  }

  const [{ worker, extensionId }] = workers;
  report.extension_loaded = 'yes';
  report.extension_id = extensionId;
  report.single_extension_instance = 'yes';
  worker.on('console', (message) => {
    if (message.type() === 'error' && isSearchLensError(message.text(), extensionId)) {
      serviceWorkerErrors.push(message.text());
    }
  });

  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && isSearchLensError(message.text(), extensionId)) {
      pageErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (isSearchLensError(error.stack || error.message, extensionId)) pageErrors.push(error.message);
  });

  await page.goto(`https://www.baidu.com/s?wd=${encodeURIComponent(expectedQuery)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page.waitForFunction(
    (query) => {
      const panel = document.querySelector('#searchlens-panel');
      const currentQuery = panel?.querySelector('.searchlens-query')?.textContent?.trim();
      return document.querySelectorAll('#searchlens-panel').length === 1
        && currentQuery === query
        && panel.querySelectorAll('.searchlens-card').length > 0;
    },
    { timeout: 25_000 },
    expectedQuery,
  );

  const readPanel = () => page.evaluate(() => ({
    panelCount: document.querySelectorAll('#searchlens-panel').length,
    query: document.querySelector('#searchlens-panel .searchlens-query')?.textContent?.trim() ?? '',
    recommendationCount: document.querySelectorAll('#searchlens-panel .searchlens-card').length,
  }));
  const firstPanel = await readPanel();
  await sleep(1_500);
  const stablePanel = await readPanel();
  report.panel_count = stablePanel.panelCount;
  report.query = stablePanel.query;
  report.recommendation_count = stablePanel.recommendationCount;
  if (JSON.stringify(firstPanel) !== JSON.stringify(stablePanel)) {
    throw new Error(`Panel state did not remain stable: ${JSON.stringify({ firstPanel, stablePanel })}`);
  }

  const optionsTargetPromise = browser.waitForTarget(
    (target) => target.url() === `chrome-extension://${extensionId}/options.html`,
    { timeout: 15_000 },
  );
  await page.click('#searchlens-panel .searchlens-settings-btn');
  const optionsTarget = await optionsTargetPromise;
  const optionsSession = await optionsTarget.createCDPSession();
  await optionsSession.send('Runtime.enable');
  optionsSession.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    const text = exceptionDetails.exception?.description || exceptionDetails.text;
    if (isSearchLensError(text, extensionId)) pageErrors.push(text);
  });

  let optionsShell = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const evaluated = await optionsSession.send('Runtime.evaluate', {
      expression: "document.querySelectorAll('.options-shell').length",
      returnByValue: true,
    });
    optionsShell = evaluated.result.value ?? 0;
    if (optionsShell === 1) break;
    await sleep(250);
  }
  await optionsSession.detach();
  report.options_opened = optionsShell === 1 ? 'yes' : 'no';

  report.searchlens_errors = pageErrors.length;
  report.service_worker_errors = serviceWorkerErrors.length;
  if (
    report.panel_count !== 1
    || report.query !== expectedQuery
    || report.recommendation_count < 1
    || report.options_opened !== 'yes'
    || report.searchlens_errors !== 0
    || report.service_worker_errors !== 0
  ) {
    throw new Error(`Package smoke assertions failed: ${JSON.stringify(report)}`);
  }
  report.verdict = 'PASS';
} catch (error) {
  failure = error;
  report.searchlens_errors = pageErrors.length;
  report.service_worker_errors = serviceWorkerErrors.length;
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
      report.verdict = 'FAIL';
      failure ??= new Error(`Residual Chrome for Testing processes: ${report.residual_processes}`);
      process.exitCode = 1;
    }
  } catch (error) {
    report.residual_processes = 'check_failed';
    report.verdict = 'FAIL';
    failure ??= error;
    process.exitCode = 1;
  }
  rmSync(profile, { recursive: true, force: true });
  for (const [key, value] of Object.entries(report)) process.stdout.write(`${key}=${value}\n`);
  if (failure) process.stderr.write(`failure_reason=${failure.message}\n`);
}
