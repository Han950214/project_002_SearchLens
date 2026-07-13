/**
 * SearchLens CN — Scoring Engine (M3)
 *
 * Scores each extracted SearchResult based on multiple signals:
 *  1. Official domain match         (high weight)
 *  2. Intent-query relevance        (medium weight)
 *  3. Source trust level            (medium weight)
 *  4. User domain preference        (adjustable)
 *  5. Docs / repo bonus             (low weight)
 *  6. Ad / promoted penalty         (high negative)
 *  7. Third-party download penalty  (medium negative)
 *  8. SEO / marketing penalty       (low negative)
 *  9. Suspicious domain penalty     (medium negative)
 *
 * Final score: 0-100, with 60+ = "high" confidence, 30-59 = "medium", <30 = "low".
 */

import type { SearchResult, ResultType, ScoreReason, ConfidenceLevel } from '../models/search-result';
import type { QueryIntent } from '../models/search-result';
import type { EntityMatch } from '../rules/entity-rules';
import { matchEntityDomain, supportsEntityDomainIntent } from '../rules/entity-rules';
import { getIntentPatterns } from './query-intent';
import { normalizeDomain } from '../utils/domain';
import { containsKeyword } from '../utils/text';

// ── Weights (default, can be overridden via settings) ──

export interface ScoringWeights {
  officialSignal: number;
  intentMatch: number;
  sourceTrust: number;
  userPreference: number;
  docsOrRepoBonus: number;
  adRisk: number;
  thirdPartyDownloadRisk: number;
  seoMarketingRisk: number;
  suspiciousDomainRisk: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  officialSignal:          40,
  intentMatch:             15,
  sourceTrust:             20,
  userPreference:          15,
  docsOrRepoBonus:         10,
  adRisk:                 -50,
  thirdPartyDownloadRisk: -30,
  seoMarketingRisk:       -20,
  suspiciousDomainRisk:   -25,
};

const POSITIVE_WEIGHT_KEYS: Array<keyof ScoringWeights> = [
  'officialSignal',
  'intentMatch',
  'sourceTrust',
  'userPreference',
  'docsOrRepoBonus',
];

const RISK_WEIGHT_KEYS: Array<keyof ScoringWeights> = [
  'adRisk',
  'thirdPartyDownloadRisk',
  'seoMarketingRisk',
  'suspiciousDomainRisk',
];

function resolveScoringWeights(overrides?: Partial<ScoringWeights>): ScoringWeights {
  const resolved = { ...DEFAULT_WEIGHTS };

  for (const key of POSITIVE_WEIGHT_KEYS) {
    const value = overrides?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      resolved[key] = value;
    }
  }

  for (const key of RISK_WEIGHT_KEYS) {
    const value = overrides?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value <= 0) {
      resolved[key] = value;
    }
  }

  return resolved;
}

function toFiniteScoreImpact(value: number): number {
  const finiteValue = Number.isFinite(value)
    ? value
    : value < 0
      ? -Number.MAX_VALUE
      : Number.MAX_VALUE;
  const scaled = finiteValue * 100;
  return Number.isFinite(scaled) ? Math.round(scaled) / 100 : finiteValue;
}

// ── Trust levels by domain category ──

const TRUSTED_DOMAIN_SUFFIXES = [
  '.gov.cn', '.edu.cn', '.org.cn',
];

// Domains considered high-trust (curated)
const HIGH_TRUST_DOMAINS = new Set([
  'gitlab.com', 'bilibili.com', 'zhihu.com',
  'aliyun.com', 'azure.com', 'aws.amazon.com',
]);

// Domains considered low-trust / high-risk
const LOW_TRUST_DOMAINS = new Set([
  'downcc.com', 'cr173.com', 'pc6.com', 'xitong.com',
  'win7.com', 'win10.com', 'mydown.com', 'onlinedown.net',
]);

// ── Source trust scoring ──

function scoreSourceTrust(domain: string): number {
  if (!domain || domain === 'unknown') return 20; // unknown domain = low trust

  const normalized = normalizeDomain(domain);

  if (HIGH_TRUST_DOMAINS.has(normalized)) return 90;
  if (LOW_TRUST_DOMAINS.has(normalized)) return 10;

  if (TRUSTED_DOMAIN_SUFFIXES.some(s => normalized.endsWith(s))) return 85;

  return 50; // neutral
}

// ── Individual signal scorers ──

interface SignalResult {
  score: number;       // raw 0-100
  neutralScore: number;
  weight: number;      // from ScoringWeights
  reason?: Omit<ScoreReason, 'weight' | 'scoreImpact'>;
}

function officialSignalScore(
  result: SearchResult,
  intent: QueryIntent,
  entityMatch: EntityMatch,
  weights: ScoringWeights,
): SignalResult {
  const weight = weights.officialSignal;
  const domain = normalizeDomain(result.domain || '');
  if (!domain) return { score: 0, neutralScore: 0, weight };

  const entityDomainMatch = matchEntityDomain(entityMatch, domain);
  if (!entityDomainMatch) return { score: 0, neutralScore: 0, weight };

  if (supportsEntityDomainIntent(entityDomainMatch.domainRule, intent)) {
    return {
      score: 100,
      neutralScore: 0,
      weight,
      reason: {
        code: 'official_domain_match',
        label: `查询实体与官方域名特征匹配：${entityDomainMatch.entity.label}`,
        category: 'positive',
        effect: 'increase',
        confidence: 'high',
      },
    };
  }

  return {
    score: 60,
    neutralScore: 0,
    weight: weight * 0.6,
    reason: {
      code: 'official_domain_partial',
      label: `查询实体与官方域名特征部分匹配：${entityDomainMatch.entity.label}`,
      category: 'positive',
      effect: 'increase',
      confidence: 'medium',
    },
  };
}

function intentMatchScore(
  result: SearchResult,
  query: string,
  intent: QueryIntent,
  weights: ScoringWeights,
): SignalResult {
  const weight = weights.intentMatch;
  if (!query) return { score: 50, neutralScore: 50, weight }; // no query = neutral

  const titleAndSnippet = `${result.title} ${result.snippet || ''}`.toLowerCase();
  const patterns = getIntentPatterns(intent);
  const matchingPatterns = patterns.filter(p => p.test(titleAndSnippet));

  if (matchingPatterns.length > 0) {
    return {
      score: Math.min(100, 50 + matchingPatterns.length * 20),
      neutralScore: 50,
      weight,
      reason: {
        code: 'intent_match',
        label: `标题/摘要匹配搜索意图`,
        category: 'positive',
        effect: 'increase',
        confidence: matchingPatterns.length >= 2 ? 'high' : 'medium',
      },
    };
  }

  return { score: 30, neutralScore: 50, weight };
}

function sourceTrustScore(result: SearchResult, weights: ScoringWeights): SignalResult {
  const weight = weights.sourceTrust;
  const trust = scoreSourceTrust(result.domain || '');
  if (trust >= 80) {
    return {
      score: trust,
      neutralScore: 50,
      weight,
      reason: {
        code: 'trusted_source',
        label: `可信来源特征`,
        category: 'positive',
        effect: 'increase',
        confidence: 'high',
      },
    };
  }
  if (trust <= 20) {
    return {
      score: trust,
      neutralScore: 50,
      weight,
      reason: {
        code: 'low_trust_source',
        label: `低可信来源`,
        category: 'negative',
        effect: 'decrease',
        confidence: 'low',
      },
    };
  }
  return { score: trust, neutralScore: 50, weight };
}

function userPreferenceScore(
  result: SearchResult,
  preferences: Record<string, 'promote' | 'demote' | 'hide'>,
  weights: ScoringWeights,
): SignalResult {
  const weight = weights.userPreference;
  const domain = normalizeDomain(result.domain || '');
  if (!domain || !preferences[domain]) return { score: 50, neutralScore: 50, weight };

  const action = preferences[domain];
  if (action === 'promote') {
    return {
      score: 100,
      neutralScore: 50,
      weight,
      reason: {
        code: 'user_preference_boost',
        label: '用户已提升',
        category: 'user_preference',
        effect: 'increase',
        confidence: 'high',
      },
    };
  }
  if (action === 'demote') {
    return {
      score: 10,
      neutralScore: 50,
      weight,
      reason: {
        code: 'user_preference_lower',
        label: '用户已降低',
        category: 'user_preference',
        effect: 'decrease',
        confidence: 'high',
      },
    };
  }

  // `hide` is consumed by the Trust Policy Gate before this soft-scoring path.
  return { score: 50, neutralScore: 50, weight };
}

function docsOrRepoBonusScore(result: SearchResult, weights: ScoringWeights): SignalResult {
  const weight = weights.docsOrRepoBonus;
  if (result.detectedType === 'github_repo') {
    return {
      score: 100,
      neutralScore: 0,
      weight,
      reason: {
        code: 'documentation_or_repository_bonus',
        label: 'GitHub 仓库',
        category: 'positive',
        effect: 'increase',
        confidence: 'high',
      },
    };
  }
  if (result.detectedType === 'baidu_baike') {
    return {
      score: 70,
      neutralScore: 0,
      weight,
      reason: {
        code: 'reference_entry_bonus',
        label: '百度百科条目',
        category: 'positive',
        effect: 'increase',
        confidence: 'medium',
      },
    };
  }

  return { score: 0, neutralScore: 0, weight };
}

function adRiskScore(result: SearchResult, weights: ScoringWeights): SignalResult {
  const weight = weights.adRisk;
  if (result.isAdOrPromoted) {
    return {
      score: 0,
      neutralScore: 100,
      weight,
      reason: {
        code: 'promoted_result_penalty',
        label: '推广结果',
        category: 'negative',
        effect: 'decrease',
        confidence: 'high',
      },
    };
  }
  return { score: 100, neutralScore: 100, weight };
}

function thirdPartyDownloadRiskScore(result: SearchResult, weights: ScoringWeights): SignalResult {
  const weight = weights.thirdPartyDownloadRisk;
  if (result.detectedType === 'third_party_download_site') {
    return {
      score: 0,
      neutralScore: 100,
      weight,
      reason: {
        code: 'third_party_download_penalty',
        label: '第三方下载站谨慎',
        category: 'negative',
        effect: 'decrease',
        confidence: 'high',
      },
    };
  }
  return { score: 100, neutralScore: 100, weight };
}

function seoMarketingRiskScore(result: SearchResult, weights: ScoringWeights): SignalResult {
  const weight = weights.seoMarketingRisk;
  // Check title and snippet for SEO / marketing patterns
  const text = `${result.title} ${result.snippet || ''}`.toLowerCase();
  const seoKeywords = ['官方下载', '免费下载', '安全下载', '高速下载', '中文版', '破解版', '绿色版'];
  const matchCount = seoKeywords.filter(k => text.includes(k)).length;

  if (matchCount >= 3) {
    return {
      score: 0,
      neutralScore: 100,
      weight,
      reason: {
        code: 'seo_marketing_penalty',
        label: '疑似 SEO 营销内容',
        category: 'negative',
        effect: 'decrease',
        confidence: 'medium',
      },
    };
  }
  if (matchCount >= 1) {
    return {
      score: 40,
      neutralScore: 100,
      weight: weight * 0.6,
      reason: {
        code: 'seo_marketing_penalty',
        label: '含营销关键词',
        category: 'negative',
        effect: 'decrease',
        confidence: 'low',
      },
    };
  }
  return { score: 100, neutralScore: 100, weight };
}

function suspiciousDomainRiskScore(result: SearchResult, weights: ScoringWeights): SignalResult {
  const weight = weights.suspiciousDomainRisk;
  const domain = result.domain || '';
  if (!domain || domain === 'unknown') return { score: 100, neutralScore: 100, weight };

  // Check for suspicious TLDs or patterns
  const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq'];
  const tld = domain.substring(domain.lastIndexOf('.'));
  if (suspiciousTLDs.includes(tld)) {
    return {
      score: 0,
      neutralScore: 100,
      weight,
      reason: {
        code: 'suspicious_domain_penalty',
        label: `可疑域名后缀 ${tld}`,
        category: 'negative',
        effect: 'decrease',
        confidence: 'medium',
      },
    };
  }

  // Check for subdomain-heavy spam patterns (e.g. download123.example.com)
  const parts = domain.split('.');
  if (parts.length > 3) {
    return {
      score: 30,
      neutralScore: 100,
      weight: weight * 0.7,
      reason: {
        code: 'suspicious_domain_penalty',
        label: '深层子域名，需谨慎',
        category: 'negative',
        effect: 'decrease',
        confidence: 'low',
      },
    };
  }

  return { score: 100, neutralScore: 100, weight };
}

// ── Main scoring function ──

export interface ScoringContext {
  query: string;
  intent: QueryIntent;
  entityMatch: EntityMatch;
  userPreferences: Record<string, 'promote' | 'demote' | 'hide'>;
  weights?: Partial<ScoringWeights>;
}

export interface ScoredResult extends SearchResult {
  score: number;
  reasons: ScoreReason[];
  confidence: ConfidenceLevel;
}

/**
 * Score a single SearchResult across all signals.
 * Returns the result with score, reasons, and confidence populated.
 */
export function scoreResult(
  result: SearchResult,
  ctx: ScoringContext,
): ScoredResult {
  const weights = resolveScoringWeights(ctx.weights);

  // Collect all signal scores
  const signals = [
    officialSignalScore(result, ctx.intent, ctx.entityMatch, weights),
    intentMatchScore(result, ctx.query, ctx.intent, weights),
    sourceTrustScore(result, weights),
    userPreferenceScore(result, ctx.userPreferences, weights),
    docsOrRepoBonusScore(result, weights),
    adRiskScore(result, weights),
    thirdPartyDownloadRiskScore(result, weights),
    seoMarketingRiskScore(result, weights),
    suspiciousDomainRiskScore(result, weights),
  ];

  // Compute weighted total
  // Each signal contributes: signal.score * (signal.weight / sum_of_positive_weights)
  // Risk signals (negative weight) subtract from positive contributions
  const positiveWeightSum = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .reduce((sum, [, w]) => sum + w, 0);
  const normalizationWeight = positiveWeightSum || 1;

  let totalScore = 0;
  const reasons: ScoreReason[] = [];

  for (const signal of signals) {
    let scoreImpact: number;
    if (signal.weight > 0) {
      // Positive signal: contribute proportionally
      const contribution = signal.score * (signal.weight / normalizationWeight);
      const neutralContribution = signal.neutralScore * (signal.weight / normalizationWeight);
      totalScore += contribution;
      scoreImpact = contribution - neutralContribution;
    } else {
      // Negative signal (risk penalty)
      // signal.score is 100 for "no risk", 0 for "high risk"
      // We multiply by the absolute weight / positiveWeightSum
      const penaltyFactor = Math.abs(signal.weight) / normalizationWeight;
      const penalty = (100 - signal.score) * penaltyFactor;
      const neutralPenalty = (100 - signal.neutralScore) * penaltyFactor;
      totalScore -= penalty;
      scoreImpact = neutralPenalty - penalty;
    }

    if (signal.reason) {
      reasons.push({
        ...signal.reason,
        weight: signal.weight,
        scoreImpact: toFiniteScoreImpact(scoreImpact),
      });
    }
  }

  // Clamp to 0-100
  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  // Derive confidence
  let confidence: ConfidenceLevel;
  if (totalScore >= 60) confidence = 'high';
  else if (totalScore >= 30) confidence = 'medium';
  else confidence = 'low';

  return {
    ...result,
    score: totalScore,
    reasons,
    confidence,
  };
}

export { detectIntent } from './query-intent';
