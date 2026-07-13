import { storageAdapter } from '../src/storage/chrome-local-storage-adapter';

export default defineBackground(() => {
  // Initialize storage adapter on service worker startup
  storageAdapter.initialize().catch((err) => {
    console.error('[SearchLens] Storage adapter initialization failed:', err);
  });

  // Listen for messages from content scripts, popup, and options page
  browser.runtime.onMessage.addListener((message: unknown, _sender: unknown) => {
    const msg = message as { type: string; payload?: Record<string, unknown> };
    switch (msg.type) {
      case 'GET_SETTINGS':
        return storageAdapter.getSettings();
      case 'SET_SETTINGS':
        return storageAdapter.setSettings(msg.payload as Record<string, unknown>);
      case 'GET_DOMAIN_PREFERENCES':
        return storageAdapter.getDomainPreferences();
      case 'SET_DOMAIN_PREFERENCE': {
        const p = msg.payload as { domain: string; action: 'promote' | 'demote' | 'hide' };
        return storageAdapter.setDomainPreference(p.domain, p.action);
      }
      case 'REMOVE_DOMAIN_PREFERENCE': {
        const r = msg.payload as { domain: string };
        return storageAdapter.removeDomainPreference(r.domain);
      }
      case 'CLEAR_DOMAIN_PREFERENCES':
        return storageAdapter.clearDomainPreferences();
      case 'OPEN_OPTIONS':
        return browser.runtime.openOptionsPage().catch(() =>
          browser.tabs.create({ url: browser.runtime.getURL('/options.html') })
        );
      default:
        console.warn('[SearchLens] Unknown message type:', msg.type);
        return Promise.resolve(null);
    }
  });
});
