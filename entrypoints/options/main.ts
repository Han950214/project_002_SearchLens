/**
 * SearchLens CN — Options Page Script
 */

import type { SearchLensSettings } from '../../src/storage/chrome-local-storage-adapter';

// ── DOM elements ──
const enabledToggle = document.getElementById('enabled-toggle') as HTMLInputElement | null;
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
    if (enabledToggle) {
      enabledToggle.checked = settings?.enabled !== false;
    }
  } catch (err) {
    console.error('[SearchLens] Failed to load settings:', err);
    showStatus('无法加载设置', 'error');
  }
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
      // Basic validation
      if (data.settings) {
        await browser.runtime.sendMessage({
          type: 'SET_SETTINGS',
          payload: data.settings,
        });
      }
      if (data.domainPreferences && Array.isArray(data.domainPreferences)) {
        for (const pref of data.domainPreferences) {
          await browser.runtime.sendMessage({
            type: 'SET_DOMAIN_PREFERENCE',
            payload: pref,
          });
        }
      }
      showStatus('设置已导入', 'success');
      await loadSettings();
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

// ── Event listeners ──
enabledToggle?.addEventListener('change', () => {
  saveSettings('enabled', enabledToggle.checked);
});

exportBtn?.addEventListener('click', handleExport);
importBtn?.addEventListener('click', handleImport);
resetBtn?.addEventListener('click', handleReset);

// ── Initial load ──
loadSettings();
