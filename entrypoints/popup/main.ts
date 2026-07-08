/**
 * SearchLens CN — Popup Script
 */

// Open the options page when the settings button is clicked
document.getElementById('open-options-btn')?.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

// Query the current extension status
async function updateStatus(): Promise<void> {
  try {
    const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' }) as { enabled?: boolean };
    const enabled = settings.enabled !== false; // default: enabled
    const statusArea = document.getElementById('status-area');
    if (statusArea) {
      const indicator = statusArea.querySelector('.status-indicator');
      const text = statusArea.querySelector('.status-text');
      if (indicator) {
        indicator.className = enabled
          ? 'status-indicator status-active'
          : 'status-indicator status-inactive';
      }
      if (text) {
        text.textContent = enabled
          ? 'SearchLens 已启用'
          : 'SearchLens 已暂停';
      }
    }
  } catch (err) {
    console.error('[SearchLens] Failed to get status:', err);
  }
}

updateStatus();
