/**
 * SearchLens CN — Recommendation Engine (M3)
 *
 * Takes extracted SearchResults, scores them via the ScoringEngine,
 * sorts by score descending, and returns the top N recommendations.
 *
 * Also provides helper functions for the panel UI to render score bars,
 * confidence indicators, and reason tooltips.
 */
import type { SearchResult, ConfidenceLevel, ScoreReason } from '../models/search-result';
import { scoreResult, detectIntent, type ScoringContext, type ScoredResult } from './scoring-engine';
import { normalizeDomain } from '../utils/domain';

/** Flat domain → action map as used by content script and storage */
export type DomainPrefMap = Record<string, 'promote' | 'demote' | 'hide'>;

// ── Types ──

export interface RecommendationOutput {
  /** All scored results (sorted, not truncated) */
  all: ScoredResult[];
  /** Top-N recommendations */
  top: ScoredResult[];
  /** The detected search intent */
  intent: ReturnType<typeof detectIntent>;
  /** Whether any results were hidden by user preference */
  hasHiddenResults: boolean;
}

// ── Main recommendation function ──

export interface RecommendationOptions {
  query: string;
  results: SearchResult[];
  domainPreferences?: DomainPrefMap;
  limit?: number;
  weights?: Partial<import('./scoring-engine').ScoringWeights>;
}

/**
 * Run the full scoring + ranking pipeline.
 *
 * 1. Detect search intent from query
 * 2. Score each result
 * 3. Filter out hidden results
 * 4. Sort by score descending
 * 5. Return top N
 */
export function getRecommendations(options: RecommendationOptions): RecommendationOutput {
  const {
    query,
    results,
    domainPreferences = {},
    limit = 5,
    weights,
  } = options;

  const intent = detectIntent(query);

  const userPrefs = domainPreferences;

  const ctx: ScoringContext = { query, intent, userPreferences: userPrefs, weights };

  // Score all results
  const scored: ScoredResult[] = results.map(r => scoreResult(r, ctx));

  // Separate hidden results
  const hidden = scored.filter(r => {
    const d = normalizeDomain(r.domain ?? '');
    return d ? userPrefs[d] === 'hide' : false;
  });

  // Filtered (exclude hidden)
  const visible = scored.filter(r => {
    const d = normalizeDomain(r.domain ?? '');
    return !(d && userPrefs[d] === 'hide');
  });

  // Sort by score descending, then by originalRank as tiebreaker
  visible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalRank - b.originalRank;
  });

  return {
    all: visible,
    top: visible.slice(0, limit),
    intent,
    hasHiddenResults: hidden.length > 0,
  };
}

// ── Display helpers for panel UI ──

export interface RecommendationDisplayItem {
  rank: number;            // position in recommendation list (1-based)
  originalRank: number;    // original rank in search results
  title: string;
  domain: string;
  displayUrl: string;
  score: number;
  scoreBarClass: string;   // CSS class for score bar coloring
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  confidenceClass: string; // CSS class
  typeLabel: string;
  isAd: boolean;
  reasons: ScoreReason[];
  topReason: string;       // short human-readable primary reason
}

/**
 * Convert a ScoredResult into a display-friendly item for the panel.
 */
export function toDisplayItem(result: ScoredResult, rank: number): RecommendationDisplayItem {
  const confidenceLabel = getConfidenceLabel(result.confidence);
  const scoreBarClass = getScoreBarClass(result.score);
  const confidenceClass = getConfidenceClass(result.confidence);
  const typeLabel = getResultTypeLabel(result.detectedType);
  const topReason = getTopReason(result.reasons);

  return {
    rank,
    originalRank: result.originalRank,
    title: result.title,
    domain: result.domain || 'unknown',
    displayUrl: result.displayUrl || result.domain || 'unknown',
    score: result.score,
    scoreBarClass,
    confidence: result.confidence,
    confidenceLabel,
    confidenceClass,
    typeLabel,
    isAd: result.isAdOrPromoted,
    reasons: result.reasons,
    topReason,
  };
}

function getConfidenceLabel(c: ConfidenceLevel): string {
  switch (c) {
    case 'high':   return '较高参考';
    case 'medium': return '中等参考';
    case 'low':    return '较低参考';
    default:       return '未知';
  }
}

function getScoreBarClass(score: number): string {
  if (score >= 80) return 'score-high';
  if (score >= 50) return 'score-medium';
  if (score >= 25) return 'score-low';
  return 'score-very-low';
}

function getConfidenceClass(c: ConfidenceLevel): string {
  switch (c) {
    case 'high':   return 'conf-high';
    case 'medium': return 'conf-medium';
    case 'low':    return 'conf-low';
    default:       return 'conf-unknown';
  }
}

function getResultTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    official_site: '官方网站',
    official_download: '官方下载',
    official_docs: '官方文档',
    official_login: '官方登录',
    app_store: '应用商店',
    github_repo: 'GitHub',
    baidu_baike: '百度百科',
    baidu_zhidao: '百度知道',
    baidu_wenku: '百度文库',
    baidu_tieba: '百度贴吧',
    baijiahao: '百家号',
    third_party_download_site: '第三方下载站',
    software_mirror: '软件镜像',
    seo_article: 'SEO 文章',
    ad_or_promoted: '推广',
    forum_or_community: '论坛/社区',
    news: '新闻',
    unknown: '未分类',
  };
  return labels[type] || type || '未分类';
}

function getTopReason(reasons: ScoreReason[]): string {
  if (reasons.length === 0) return '';
  // Return the reason with the highest absolute weight, preferring positive
  const positive = reasons.filter(r => r.weight > 0);
  if (positive.length > 0) {
    positive.sort((a, b) => b.weight - a.weight);
    return positive[0].label;
  }
  // If all negative, return the most impactful negative reason
  const sorted = [...reasons].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return sorted[0].label;
}
