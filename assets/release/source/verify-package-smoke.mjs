import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = resolve(new URL('../../..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const extensionPath = join(projectRoot, '.output', 'chrome-mv3');
const chromePath = process.argv[2] ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = mkdtempSync(join(tmpdir(), 'searchlens-package-smoke-'));

const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Search fixture</title>
<style>body{font-family:sans-serif}#content_left{width:800px}.c-container{width:760px;min-height:90px;margin:12px;padding:12px;border:1px solid #ddd}</style></head><body>
<div id="s_tab"><a class="cur">网页</a></div><input id="kw" value="Python download">
<main id="content_left">
<div class="c-container"><h3 class="t"><a href="https://www.python.org/downloads/">Download Python</a></h3><div class="c-showurl">python.org/downloads</div><div class="c-abstract">Python downloads from the project website.</div></div>
<div class="c-container"><h3 class="t"><a href="https://docs.python.org/3/">Python Documentation</a></h3><div class="c-showurl">docs.python.org/3</div><div class="c-abstract">Documentation and installation guidance.</div></div>
</main></body></html>`;

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
  }
  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }
  on(listener) { this.listeners.push(listener); }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolveSend, reject) => this.pending.set(id, { resolve: resolveSend, reject }));
  }
  close() { this.socket.close(); }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let chrome;
let cdp;

try {
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Chrome DevTools endpoint')), 15000);
    chrome.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
    chrome.once('exit', (code) => reject(new Error(`Chrome exited before smoke: ${code}`)));
  });

  cdp = new Cdp(endpoint);
  await cdp.open();
  const browserVersion = await cdp.send('Browser.getVersion');
  const errors = [];
  let pageSession;
  cdp.on((message) => {
    if (message.sessionId === pageSession && message.method === 'Fetch.requestPaused') {
      void cdp.send('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from(fixture).toString('base64'),
      }, pageSession);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });

  await cdp.send('Target.setDiscoverTargets', { discover: true });
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  pageSession = attached.sessionId;
  await cdp.send('Runtime.enable', {}, pageSession);
  await cdp.send('Log.enable', {}, pageSession);
  await cdp.send('Page.enable', {}, pageSession);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.baidu.com/s*', requestStage: 'Request' }] }, pageSession);
  await cdp.send('Page.navigate', { url: 'https://www.baidu.com/s?wd=Python%20download' }, pageSession);
  await sleep(3000);

  const panel = await cdp.send('Runtime.evaluate', {
    expression: `({href:location.href,readyState:document.readyState,panelCount:document.querySelectorAll('#searchlens-panel').length,query:document.querySelector('.searchlens-query')?.textContent,title:document.querySelector('.searchlens-title')?.textContent,settingsButtons:document.querySelectorAll('.searchlens-settings-btn').length})`,
    returnByValue: true,
  }, pageSession);

  const targets = (await cdp.send('Target.getTargets')).targetInfos;
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.searchlens-settings-btn').click()` }, pageSession);
  await sleep(1200);
  const refreshedTargets = (await cdp.send('Target.getTargets')).targetInfos;
  const optionsTarget = refreshedTargets.find((target) => ['page', 'webview'].includes(target.type) && target.url.endsWith('/options.html'));
  if (!optionsTarget) throw new Error(`Options target not opened: ${JSON.stringify(refreshedTargets.map(({ type, url }) => ({ type, url })))}`);
  const extensionId = new URL(optionsTarget.url).host;
  const worker = refreshedTargets.find((target) => target.type === 'service_worker' && new URL(target.url).host === extensionId);
  if (!worker) throw new Error('SearchLens service worker target not found');
  const optionsAttached = await cdp.send('Target.attachToTarget', { targetId: optionsTarget.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, optionsAttached.sessionId);
  await cdp.send('Log.enable', {}, optionsAttached.sessionId);
  await sleep(1200);
  const options = await cdp.send('Runtime.evaluate', {
    expression: `({href:location.href,readyState:document.readyState,title:document.title,shell:document.querySelectorAll('.options-shell').length,body:document.body?.innerText?.slice(0,120)})`,
    returnByValue: true,
  }, optionsAttached.sessionId);

  const panelValue = panel.result.value;
  const optionsValue = options.result.value;
  const passed = panelValue.panelCount === 1 && panelValue.query === 'Python download' && panelValue.title && optionsValue.shell === 1 && errors.length === 0;
  const result = { passed, browser: browserVersion.product, extensionLoaded: true, worker: worker.url, panel: panelValue, options: optionsValue, errors };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  cdp?.close();
  chrome?.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
