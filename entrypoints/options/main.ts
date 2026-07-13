import type { SearchLensSettings } from '../../src/storage/chrome-local-storage-adapter';
import type { DomainPrefMap } from '../../src/scoring/recommendation-engine';

const enabledToggle = document.getElementById('enabled-toggle') as HTMLInputElement | null;
const recLimitSelect = document.getElementById('rec-limit-select') as HTMLSelectElement | null;
const showConfidenceToggle = document.getElementById('show-confidence-toggle') as HTMLInputElement | null;
const showReasonsToggle = document.getElementById('show-reasons-toggle') as HTMLInputElement | null;
const warnDownloadToggle = document.getElementById('warn-download-toggle') as HTMLInputElement | null;
const domainPrefsList = document.getElementById('domain-prefs-list');
const domainPrefCount = document.getElementById('domain-pref-count');
const clearDomainPrefsBtn = document.getElementById('clear-domain-prefs-btn') as HTMLButtonElement | null;
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const resetBtn = document.getElementById('reset-btn');
const dataStatus = document.getElementById('data-status');

let statusTimer: number | undefined;

async function loadSettings(): Promise<void> {
  try {
    const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' }) as SearchLensSettings;
    if (enabledToggle) enabledToggle.checked = settings?.enabled !== false;
    if (recLimitSelect) recLimitSelect.value = String(settings?.recommendationLimit ?? 5);
    if (showConfidenceToggle) showConfidenceToggle.checked = settings?.showConfidence !== false;
    if (showReasonsToggle) showReasonsToggle.checked = settings?.showReasons !== false;
    if (warnDownloadToggle) warnDownloadToggle.checked = settings?.warnThirdPartyDownloadSites !== false;
  } catch (err) {
    console.error('[SearchLens] Failed to load settings:', err);
    showStatus('无法读取本地设置。', 'error');
  }
}

async function loadDomainPreferences(): Promise<void> {
  try {
    const prefs = await browser.runtime.sendMessage({ type: 'GET_DOMAIN_PREFERENCES' }) as DomainPrefMap;
    renderDomainPreferences(prefs ?? {});
  } catch (err) {
    console.error('[SearchLens] Failed to load domain preferences:', err);
    if (domainPrefsList) domainPrefsList.innerHTML = '<p class="empty-hint is-error">域名偏好读取失败。</p>';
    showStatus('无法读取域名偏好。', 'error');
  }
}

function renderDomainPreferences(prefs: DomainPrefMap): void {
  if (!domainPrefsList) return;
  const entries = Object.entries(prefs).sort(([left], [right]) => left.localeCompare(right));
  if (domainPrefCount) domainPrefCount.textContent = String(entries.length);
  if (clearDomainPrefsBtn) clearDomainPrefsBtn.disabled = entries.length === 0;

  const groups: Array<{
    action: DomainPrefMap[string];
    title: string;
    description: string;
  }> = [
    { action: 'promote', title: '已提升', description: '优先提高推荐顺序' },
    { action: 'demote', title: '已降低', description: '在同类结果中降低顺序' },
    { action: 'hide', title: '已隐藏', description: '从推荐结果中优先排除' },
  ];

  domainPrefsList.innerHTML = groups.map(group => {
    const groupEntries = entries.filter(([, action]) => action === group.action);
    const rows = groupEntries.length > 0
      ? groupEntries.map(([domain]) => `<div class="domain-pref-item">
          <span class="domain-pref-domain">${escapeHtml(domain)}</span>
          <button class="domain-pref-remove-btn" type="button" data-domain="${escapeHtml(domain)}" aria-label="移除 ${escapeHtml(domain)} 的偏好">移除</button>
        </div>`).join('')
      : '<p class="group-empty">暂无</p>';

    return `<section class="domain-group action-${group.action}">
      <div class="domain-group-heading"><div><h3>${group.title}</h3><p>${group.description}</p></div><span>${groupEntries.length}</span></div>
      <div class="domain-group-list">${rows}</div>
    </section>`;
  }).join('');
}

async function removeDomainPreference(domain: string): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'REMOVE_DOMAIN_PREFERENCE', payload: { domain } });
    showStatus(`已移除 ${domain} 的偏好。`, 'success');
    await loadDomainPreferences();
  } catch (err) {
    console.error('[SearchLens] Failed to remove domain preference:', err);
    showStatus('域名偏好移除失败。', 'error');
  }
}

async function clearDomainPreferences(): Promise<void> {
  if (!confirm('确定清空全部域名提升、降低和隐藏规则吗？')) return;
  try {
    await browser.runtime.sendMessage({ type: 'CLEAR_DOMAIN_PREFERENCES' });
    showStatus('已清空全部域名偏好。', 'success');
    await loadDomainPreferences();
  } catch (err) {
    console.error('[SearchLens] Failed to clear domain preferences:', err);
    showStatus('域名偏好清空失败。', 'error');
  }
}

async function saveSettings(key: keyof SearchLensSettings, value: unknown): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'SET_SETTINGS', payload: { [key]: value } });
    showStatus('设置已保存。', 'success');
  } catch (err) {
    console.error('[SearchLens] Failed to save settings:', err);
    showStatus('设置保存失败。', 'error');
    await loadSettings();
  }
}

async function handleExport(): Promise<void> {
  try {
    const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const domainPreferences = await browser.runtime.sendMessage({ type: 'GET_DOMAIN_PREFERENCES' });
    const blob = new Blob(
      [JSON.stringify({ settings, domainPreferences }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `searchlens-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showStatus('设置已导出。', 'success');
  } catch (err) {
    console.error('[SearchLens] Export failed:', err);
    showStatus('设置导出失败。', 'error');
  }
}

function handleImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text()) as {
        settings?: Partial<SearchLensSettings>;
        domainPreferences?: Record<string, unknown>;
      };
      if (data.settings && typeof data.settings === 'object') {
        await browser.runtime.sendMessage({ type: 'SET_SETTINGS', payload: data.settings });
      }
      if (data.domainPreferences && typeof data.domainPreferences === 'object') {
        await browser.runtime.sendMessage({ type: 'CLEAR_DOMAIN_PREFERENCES' });
        for (const [domain, action] of Object.entries(data.domainPreferences)) {
          if (action === 'promote' || action === 'demote' || action === 'hide') {
            await browser.runtime.sendMessage({ type: 'SET_DOMAIN_PREFERENCE', payload: { domain, action } });
          }
        }
      }
      await Promise.all([loadSettings(), loadDomainPreferences()]);
      showStatus('设置已导入。', 'success');
    } catch (err) {
      console.error('[SearchLens] Import failed:', err);
      showStatus('导入失败：请检查备份文件格式。', 'error');
    }
  });
  input.click();
}

async function handleReset(): Promise<void> {
  if (!confirm('确定重置全部 SearchLens 本地设置和域名偏好吗？')) return;
  try {
    await browser.storage.local.clear();
    await Promise.all([loadSettings(), loadDomainPreferences()]);
    showStatus('全部本地数据已重置。', 'success');
  } catch (err) {
    console.error('[SearchLens] Reset failed:', err);
    showStatus('本地数据重置失败。', 'error');
  }
}

function showStatus(message: string, type: 'success' | 'error'): void {
  if (!dataStatus) return;
  if (statusTimer) clearTimeout(statusTimer);
  dataStatus.textContent = message;
  dataStatus.className = `data-status data-status-${type}`;
  dataStatus.hidden = false;
  statusTimer = window.setTimeout(() => { dataStatus.hidden = true; }, 3200);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

domainPrefsList?.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  const button = target?.closest<HTMLButtonElement>('.domain-pref-remove-btn');
  const domain = button?.dataset.domain;
  if (domain) void removeDomainPreference(domain);
});

enabledToggle?.addEventListener('change', () => { void saveSettings('enabled', enabledToggle.checked); });
recLimitSelect?.addEventListener('change', () => { void saveSettings('recommendationLimit', Number(recLimitSelect.value)); });
showConfidenceToggle?.addEventListener('change', () => { void saveSettings('showConfidence', showConfidenceToggle.checked); });
showReasonsToggle?.addEventListener('change', () => { void saveSettings('showReasons', showReasonsToggle.checked); });
warnDownloadToggle?.addEventListener('change', () => { void saveSettings('warnThirdPartyDownloadSites', warnDownloadToggle.checked); });
clearDomainPrefsBtn?.addEventListener('click', () => { void clearDomainPreferences(); });
exportBtn?.addEventListener('click', () => { void handleExport(); });
importBtn?.addEventListener('click', handleImport);
resetBtn?.addEventListener('click', () => { void handleReset(); });

void Promise.all([loadSettings(), loadDomainPreferences()]);
