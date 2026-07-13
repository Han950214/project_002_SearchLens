export type ResultType =
  | "official_site" | "official_download" | "official_docs"
  | "official_login" | "app_store" | "github_repo"
  | "baidu_baike" | "baidu_zhidao" | "baidu_wenku" | "baidu_tieba"
  | "baijiahao" | "third_party_download_site" | "software_mirror"
  | "seo_article" | "ad_or_promoted" | "forum_or_community"
  | "news" | "unknown";

export type QueryIntent =
  | "official_site" | "download" | "official_docs"
  | "login" | "sensitive_official" | "general";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type ScoreReasonCategory = "positive" | "negative" | "user_preference" | "policy";
export type ScoreReasonEffect = "increase" | "decrease" | "exclude";

export interface ScoreReason {
  code: string;
  label: string;
  weight: number;
  scoreImpact: number;
  category: ScoreReasonCategory;
  effect: ScoreReasonEffect;
  confidence: ConfidenceLevel;
}

export interface SearchResult {
  id: string; title: string; url: string; resolvedUrl?: string; domain?: string;
  displayUrl?: string; snippet?: string; originalRank: number; sourceEngine: "baidu";
  isAdOrPromoted: boolean; detectedType: ResultType; score: number;
  reasons: ScoreReason[]; confidence: ConfidenceLevel;
}

export interface RankingSignals {
  originalRank: number; officialSignal: number; intentMatch: number;
  sourceTrust: number; userPreference: number; docsOrRepoBonus: number;
  adRisk: number; thirdPartyDownloadRisk: number;
  seoMarketingRisk: number; suspiciousDomainRisk: number;
}
