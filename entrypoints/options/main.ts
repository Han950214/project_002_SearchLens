/**
 * SearchLens CN — Options Page Script
 *
 * M3 expanded: supports recommendationLimit, showConfidence, showReasons,
 * warnThirdPartyDownloadSites, and domain preference management.
 */

import type { SearchLensSettings } from '../../src/storage/chrome-local-storage-adapter';
import type { DomainPrefMap } from '../../src/scoring/recommendation-engine';

// ── DOM elements ──
const enabledToggle = document.getElementById('enabled-toggle') as HTMLInputElement | null;
const recLimitSelect = document.getElementById('rec-limit-select') as HTMLSelectElement | null;
const showConfidenceToggle = document.getElementById('show-confidence-toggle') as HTMLInputElement | null;
const showReasonsToggle = document.getElementById('show-reasons-toggle') as HTMLInputElement | null;
const warnDownloadToggle = document.getElementById('warn-download-toggle') as HTMLInputElement | null;
const domainPrefsList = document.getElementById('domain-prefs-list');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const resetBtn = document.getElementById('reset-btn');
const dataStatus = document.getElementById('data-status');

// ── Load current settings ──
async function loadSettings(): Promise<void> {
  try {
    const settings: SearchLensSettings = await browser.runtime.sendMessage({
      type: 'GET_SETTINGS',
    });
    if (enabledToggle) enabledToggle.checked = settings?.enabled !== false;
    if (recLimitSelect) recLimitSelect.value = String(settings?.recommendationLimit ?? 5);
    if (showConfidenceToggle) showConfidenceToggle.checked = settings?.showConfidence !== false;
    if (showReasonsToggle) showReasonsToggle.checked = settings?.showReasons !== false;
    if (warnDownloadToggle) warnDownloadToggle.checked = settings?.warnThirdPartyDownloadSites !== false;
  } catch (err) {
    console.error('[SearchLens] Failed to load settings:', err);
    showStatus('无法加载设置', 'error');
  }
}

// ── Load and render domain preferences ──
async function loadDomainPrefs(): Promise<void> {
  try {
    const prefs: DomainPrefMap = await browser.runtime.sendMessage({ type: 'GET_DOMAIN_PREFERENCES' });
    renderDomainPrefs(prefs);
  } catch (err) {
    console.error('[SearchLens] Failed to load domain prefs:', err);
  }
}

function renderDomainPrefs(prefs: DomainPrefMap): void {
  if (!domainPrefsList) return;
  const entries = Object.entries(prefs);

  if (entries.length === 0) {
    domainPrefsList.innerHTML = '<p class="empty-hint">暂无自定义偏好。</p>';
    return;
  }

  const actionLabels: Record<string, string> = {
    promote: '已提升',
    demote: '已降低',
    hide: '已隐藏',
  };

  const itemsHtml = entries.map(([domain, action]) => `
    <div class="domain-pref-item" data-domain="${escapeHtml(domain)}">
      <div>
        <span class="domain-pref-domain">${escapeHtml(domain)}</span>
        <span class="domain-pref-action-badge action-${action}">${escapeHtml(actionLabels[action] || action)}</span>
      </div>
      <button class="domain-pref-remove-btn" data-domain="${escapeHtml(domain)}">✕ 移除</button>
    </div>
  `).join('');

  domainPrefsList.innerHTML = itemsHtml;

  // Wire up remove buttons
  domainPrefsList.querySelectorAll('.domain-pref-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = (btn as HTMLElement).dataset.domain;
      if (!domain) return;
      try {
        await browser.runtime.sendMessage({
          type: 'REMOVE_DOMAIN_PREFERENCE',
          payload: { domain },
        });
        showStatus('已移除域名偏好', 'success');
        await loadDomainPrefs();
      } catch (err) {
        console.error('[SearchLens] Failed to remove domain pref:', err);
        showStatus('移除失败', 'error');
      }
    });
  });
}

// ── Save settings ──
async function saveSettings(key: keyof SearchLensSettings, value: unknown): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: 'SET_SETTINGS',
      payload: { [key]: value },
    });
    showStatus('设置已保存', 'success');
  } catch (err) {
    console.error('[SearchLens] Failed to save settings:', err);
    showStatus('保存失败', 'error');
  }
}

// ── Export ──
async function handleExport(): Promise<void> {
  try {
    const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const prefs = await browser.runtime.sendMessage({ type: 'GET_DOMAIN_PREFERENCES' });
    const blob = new Blob(
      [JSON.stringify({ settings, domainPreferences: prefs }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `searchlens-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('设置已导出', 'success');
  } catch (err) {
    console.error('[SearchLens] Export failed:', err);
    showStatus('导出失败', 'error');
  }
}

// ── Import ──
function handleImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.settings) {
        await browser.runtime.sendMessage({
          type: 'SET_SETTINGS',
          payload: data.settings,
        });
      }
      if (data.domainPreferences && typeof data.domainPreferences === 'object') {
        // DomainPreferencesMap is a flat {} map; iterate and set each
        for (const [domain, action] of Object.entries(data.domainPreferences)) {
          if (typeof action === 'string') {
            await browser.runtime.sendMessage({
              type: 'SET_DOMAIN_PREFERENCE',
              payload: { domain, action },
            });
          }
        }
      }
      showStatus('设置已导入', 'success');
      await loadSettings();
      await loadDomainPrefs();
    } catch (err) {
      console.error('[SearchLens] Import failed:', err);
      showStatus('导入失败：文件格式不正确', 'error');
    }
  });
  input.click();
}

// ── Reset ──
async function handleReset(): Promise<void> {
  if (!confirm('确定要重置所有 SearchLens 设置和偏好吗？此操作不可撤销。')) return;
  try {
    await browser.storage.local.clear();
    showStatus('所有设置已重置', 'success');
    await loadSettings();
    await loadDomainPrefs();
  } catch (err) {
    console.error('[SearchLens] Reset failed:', err);
    showStatus('重置失败', 'error');
  }
}

// ── Status helper ──
function showStatus(message: string, type: 'success' | 'error'): void {
  if (!dataStatus) return;
  dataStatus.textContent = message;
  dataStatus.className = `data-status data-status-${type}`;
  dataStatus.hidden = false;
  setTimeout(() => {
    if (dataStatus) dataStatus.hidden = true;
  }, 3000);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Event listeners ──
enabledToggle?.addEventListener('change', () => {
  saveSettings('enabled', enabledToggle.checked);
});

recLimitSelect?.addEventListener('change', () => {
  saveSettings('recommendationLimit', Number(recLimitSelect.value));
});

showConfidenceToggle?.addEventListener('change', () => {
  saveSettings('showConfidence', showConfidenceToggle.checked);
});

showReasonsToggle?.addEventListener('change', () => {
  saveSettings('showReasons', showReasonsToggle.checked);
});

warnDownloadToggle?.addEventListener('change', () => {
  saveSettings('warnThirdPartyDownloadSites', warnDownloadToggle.checked);
});

exportBtn?.addEventListener('click', handleExport);
importBtn?.addEventListener('click', handleImport);
resetBtn?.addEventListener('click', handleReset);

// ── Initial load ──
loadSettings();
loadDomainPrefs();
