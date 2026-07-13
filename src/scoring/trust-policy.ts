import type { ScoreReason, SearchResult } from '../models/search-result';
import { normalizeDomain } from '../utils/domain';

export type TrustPolicyPreferences = Record<string, 'promote' | 'demote' | 'hide'>;

export type TrustPolicyDecision =
  | { action: 'allow' }
  | { action: 'exclude'; reason: ScoreReason };

/**
 * Apply deterministic local policy before soft scoring.
 *
 * A stored user `hide` is an explicit local exclusion. Heuristic risk signals
 * deliberately do not belong here and remain score penalties.
 */
export function evaluateTrustPolicy(
  result: SearchResult,
  preferences: TrustPolicyPreferences,
): TrustPolicyDecision {
  const domain = normalizeDomain(result.domain || '');

  if (domain && preferences[domain] === 'hide') {
    return {
      action: 'exclude',
      reason: {
        code: 'explicit_user_hide',
        label: '用户已隐藏',
        weight: 0,
        scoreImpact: 0,
        category: 'policy',
        effect: 'exclude',
        confidence: 'high',
      },
    };
  }

  return { action: 'allow' };
}
