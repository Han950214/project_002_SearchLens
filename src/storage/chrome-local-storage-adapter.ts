/**
 * SearchLens CN — Chrome Storage Local Adapter
 *
 * Wraps chrome.storage.local for typed access to settings and domain preferences.
 * Provides initialization, error handling, and migration stubs for future versions.
 */

import { normalizeDomain } from '../utils/domain';

// ── Types ──

export interface SearchLensSettings {
  /** Whether SearchLens is enabled. Default: true */
  enabled: boolean;
  /** Number of recommendations to show in panel. Default: 5 */
  recommendationLimit: number;
  /** Warn about third-party download sites. Default: true */
  warnThirdPartyDownloadSites: boolean;
  /** Show confidence labels in panel. Default: true */
  showConfidence: boolean;
  /** Show scoring reasons in panel. Default: true */
  showReasons: boolean;
  /** Schema version for future migrations */
  schemaVersion: number;
  /** Timestamp of last settings update (ISO 8601) */
  updatedAt: string;
}

export interface DomainPreference {
  /** Normalized domain, e.g., "weixin.qq.com" */
  domain: string;
  /** User action on this domain */
  action: 'promote' | 'demote' | 'hide';
  /** Timestamp of the preference (ISO 8601) */
  updatedAt: string;
}

export interface DomainPreferencesMap {
  [domain: string]: DomainPreference['action'];
}

const STORAGE_KEYS = {
  SETTINGS: 'searchlens:settings',
  DOMAIN_PREFERENCES: 'searchlens:domainPreferences',
} as const;

const CURRENT_SCHEMA_VERSION = 1;

// ── Default values ──

const DEFAULT_SETTINGS: SearchLensSettings = {
  enabled: true,
  recommendationLimit: 5,
  warnThirdPartyDownloadSites: true,
  showConfidence: true,
  showReasons: true,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  updatedAt: new Date().toISOString(),
};

// ── Storage Adapter ──

export const storageAdapter = {
  /**
   * Initialize the storage adapter.
   * Ensures default settings exist and runs any pending migrations.
   */
  async initialize(): Promise<void> {
    try {
      const raw = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const settings = raw[STORAGE_KEYS.SETTINGS] as SearchLensSettings | undefined;

      if (!settings) {
        // First run: write defaults
        await chrome.storage.local.set({
          [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
        });
        console.log('[SearchLens] Storage initialized with defaults.');
        return;
      }

      // Run migrations if needed
      if ((settings.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION) {
        await migrateSettings(settings.schemaVersion ?? 0);
      }
    } catch (err) {
      console.error('[SearchLens] Storage initialization failed:', err);
      throw err;
    }
  },

  /**
   * Get current settings. Returns defaults if none saved.
   */
  async getSettings(): Promise<SearchLensSettings> {
    try {
      const raw = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const stored = raw[STORAGE_KEYS.SETTINGS] as Partial<SearchLensSettings> | undefined;
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch (err) {
      console.error('[SearchLens] Failed to get settings:', err);
      throw err;
    }
  },

  /**
   * Merge partial settings into stored settings.
   */
  async setSettings(partial: Partial<SearchLensSettings>): Promise<void> {
    try {
      const current = await this.getSettings();
      const updated: SearchLensSettings = {
        ...current,
        ...partial,
        updatedAt: new Date().toISOString(),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.SETTINGS]: updated,
      });
    } catch (err) {
      console.error('[SearchLens] Failed to set settings:', err);
      throw err;
    }
  },

  /**
   * Get all domain preferences as a map.
   */
  async getDomainPreferences(): Promise<DomainPreferencesMap> {
    try {
      const raw = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_PREFERENCES);
      return (raw[STORAGE_KEYS.DOMAIN_PREFERENCES] as DomainPreferencesMap) ?? {};
    } catch (err) {
      console.error('[SearchLens] Failed to get domain preferences:', err);
      throw err;
    }
  },

  /**
   * Set a preference for a single domain.
   */
  async setDomainPreference(domain: string, action: DomainPreference['action']): Promise<void> {
    try {
      const prefs = await this.getDomainPreferences();
      const normalizedDomain = normalizeDomain(domain);
      if (!normalizedDomain) throw new Error('A valid domain is required.');
      if (!['promote', 'demote', 'hide'].includes(action)) {
        throw new Error('A valid domain preference action is required.');
      }
      prefs[normalizedDomain] = action;
      await chrome.storage.local.set({
        [STORAGE_KEYS.DOMAIN_PREFERENCES]: prefs,
      });
    } catch (err) {
      console.error('[SearchLens] Failed to set domain preference:', err);
      throw err;
    }
  },

  /**
   * Remove a domain preference entirely.
   */
  async removeDomainPreference(domain: string): Promise<void> {
    try {
      const prefs = await this.getDomainPreferences();
      delete prefs[normalizeDomain(domain)];
      await chrome.storage.local.set({
        [STORAGE_KEYS.DOMAIN_PREFERENCES]: prefs,
      });
    } catch (err) {
      console.error('[SearchLens] Failed to remove domain preference:', err);
      throw err;
    }
  },

  /**
   * Clear domain preferences without changing the rest of the settings.
   */
  async clearDomainPreferences(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.DOMAIN_PREFERENCES]: {},
      });
    } catch (err) {
      console.error('[SearchLens] Failed to clear domain preferences:', err);
      throw err;
    }
  },
};

// ── Migrations ──

async function migrateSettings(fromVersion: number): Promise<void> {
  console.log(`[SearchLens] Migrating settings from v${fromVersion} to v${CURRENT_SCHEMA_VERSION}`);

  // v0 → v1: Add schemaVersion and updatedAt if missing
  if (fromVersion < 1) {
    const raw = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = (raw[STORAGE_KEYS.SETTINGS] as Partial<SearchLensSettings>) ?? {};
    const migrated: SearchLensSettings = {
      enabled: settings.enabled ?? true,
      recommendationLimit: 5,
      warnThirdPartyDownloadSites: true,
      showConfidence: true,
      showReasons: true,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: migrated,
    });
  }

  // Future migrations go here:
  // if (fromVersion < 2) { ... }

  console.log('[SearchLens] Settings migration complete.');
}
