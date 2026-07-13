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
import {
  evaluateTrustPolicy,
  type TrustPolicyDecision,
  type TrustPolicyPreferences,
} from './trust-policy';

/** Flat domain → action map as used by content script and storage */
export type DomainPrefMap = TrustPolicyPreferences;

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
  /** Results excluded by deterministic local policy */
  excluded: ExcludedRecommendation[];
}

export interface ExcludedRecommendation {
  result: SearchResult;
  decision: Extract<TrustPolicyDecision, { action: 'exclude' }>;
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
 * 2. Apply deterministic Trust Policy Gate
 * 3. Soft-score allowed results
 * 4. Sort by score descending
 * 5. Return top N and structured exclusions
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

  const allowed: SearchResult[] = [];
  const excluded: ExcludedRecommendation[] = [];

  for (const result of results) {
    const decision = evaluateTrustPolicy(result, userPrefs);
    if (decision.action === 'exclude') {
      excluded.push({ result, decision });
    } else {
      allowed.push(result);
    }
  }

  const visible: ScoredResult[] = allowed.map(result => scoreResult(result, ctx));

  // Sort by score descending, then by originalRank as tiebreaker
  visible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalRank - b.originalRank;
  });

  return {
    all: visible,
    top: visible.slice(0, limit),
    intent,
    hasHiddenResults: excluded.some(item => item.decision.reason.code === 'explicit_user_hide'),
    excluded,
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

export interface CompactSourceTag {
  label: string;
  className: string;
}

export function getCompactSourceTag(reasons: ScoreReason[]): CompactSourceTag | undefined {
  const reasonCodes = new Set(reasons.map(reason => reason.code));

  if (reasonCodes.has('official_domain_match')) {
    return { label: '官网', className: 'tag-official' };
  }
  if (reasonCodes.has('official_domain_partial')) {
    return { label: '官方来源', className: 'tag-official' };
  }
  if (reasonCodes.has('trusted_source') || reasonCodes.has('high_trust_domain')) {
    return { label: '可信来源', className: 'tag-trusted' };
  }

  return undefined;
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

  const policyReason = reasons.find(reason => reason.category === 'policy');
  if (policyReason) return policyReason.label;

  let topReason = reasons[0];
  let topImpact = Number.isFinite(topReason.scoreImpact) ? Math.abs(topReason.scoreImpact) : 0;

  for (let index = 1; index < reasons.length; index += 1) {
    const reason = reasons[index];
    const impact = Number.isFinite(reason.scoreImpact) ? Math.abs(reason.scoreImpact) : 0;
    if (impact > topImpact) {
      topReason = reason;
      topImpact = impact;
    }
  }

  return topReason.label;
}
