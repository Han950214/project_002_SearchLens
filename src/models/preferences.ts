export interface DomainPreference {
  domain: string;
  action: "boost" | "downrank" | "hide";
  weight: number;
  createdAt: string;
  updatedAt: string;
  source: "user";
}

export type DomainPreferencesMap = Record<string, DomainPreference>;

export interface SearchLensSettings {
  enabled: boolean;
  showRecommendationPanel: boolean;
  recommendationLimit: 3 | 5;
  warnThirdPartyDownloadSites: boolean;
  showReasons: boolean;
  showConfidenceLabel: boolean;
  domainPreferences: DomainPreferencesMap;
  version: number;
}

export interface OnboardingState { seen: boolean; seenAt: string; version: 1; }

export interface SettingsMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (input: unknown) => SearchLensSettings;
}
