import assert from 'node:assert/strict';
import { storageAdapter } from '../src/storage/chrome-local-storage-adapter';

const store: Record<string, unknown> = {};

const localStorageMock = {
  async get(key: string): Promise<Record<string, unknown>> {
    return key in store ? { [key]: structuredClone(store[key]) } : {};
  },
  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) store[key] = structuredClone(value);
  },
  async clear(): Promise<void> {
    for (const key of Object.keys(store)) delete store[key];
  },
};

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: { storage: { local: localStorageMock } },
});

await storageAdapter.initialize();
const defaults = await storageAdapter.getSettings();
assert.equal(defaults.enabled, true, 'defaults are initialized');
assert.equal(defaults.recommendationLimit, 5, 'default recommendation limit is 5');

await storageAdapter.setSettings({
  recommendationLimit: 3,
  showConfidence: false,
  showReasons: false,
});
const updated = await storageAdapter.getSettings();
assert.equal(updated.recommendationLimit, 3, 'settings write persists recommendation limit');
assert.equal(updated.showConfidence, false, 'settings write persists confidence display');
assert.equal(updated.showReasons, false, 'settings write persists reason display');

await storageAdapter.setDomainPreference('WWW.Example.com', 'promote');
await storageAdapter.setDomainPreference('hidden.example.com', 'hide');
assert.deepEqual(await storageAdapter.getDomainPreferences(), {
  'example.com': 'promote',
  'hidden.example.com': 'hide',
}, 'domain preferences are normalized and written');

await storageAdapter.removeDomainPreference('example.com');
assert.deepEqual(await storageAdapter.getDomainPreferences(), {
  'hidden.example.com': 'hide',
}, 'a single domain preference can be removed');

await storageAdapter.clearDomainPreferences();
assert.deepEqual(await storageAdapter.getDomainPreferences(), {}, 'all domain preferences can be cleared');

console.log('Storage adapter tests passed');
