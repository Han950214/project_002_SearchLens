/**
 * BaiduSearchAdapter — Main adapter orchestrator for Baidu search pages.
 * Section 9.1, M2 of dev doc.
 *
 * Coordinates: page detection, result extraction, promoted detection (M2),
 * and optional scoring / ranking (M3).
 * All logic is local-only, no network requests.
 */

import type { SearchResult } from '../../models/search-result';
import { detectPageKind, extractSearchQuery } from './page-kind-detector';
import { extractResults } from './result-extractor';
import type { PageKind } from './page-kind-detector';
import { getRecommendations } from '../../scoring/recommendation-engine';
import type { RecommendationOutput, DomainPrefMap } from '../../scoring/recommendation-engine';

export type { DomainPrefMap };

export type { PageKind };
export type { RecommendationOutput };

export interface AdapterOutput {
  pageKind: PageKind;
  query: string;
  results: SearchResult[];
  error?: string;
}

export interface ScoredAdapterOutput extends AdapterOutput {
  recommendations?: RecommendationOutput;
}

/**
 * Run the full Baidu search adapter pipeline.
 * Returns normalized results or a safe failure state.
 */
export function runBaiduAdapter(doc: Document = document): AdapterOutput {
  try {
    const pageKind = detectPageKind(doc);
    if (pageKind !== 'web_search') {
      return { pageKind, query: '', results: [] };
    }

    const query = extractSearchQuery(doc);
    const results = extractResults(doc);

    return { pageKind, query, results };
  } catch (err) {
    console.error('[SearchLens] Adapter error:', err);
    return {
      pageKind: 'not_baidu_search',
      query: '',
      results: [],
      error: err instanceof Error ? err.message : 'Unknown adapter error',
    };
  }
}

/**
 * Run the full Baidu search adapter pipeline WITH scoring / ranking (M3).
 * Extracts results, then scores, sorts, and recommends.
 */
export function runScoredAdapter(
  doc: Document = document,
  domainPreferences?: DomainPrefMap,
  limit?: number,
): ScoredAdapterOutput {
  const base = runBaiduAdapter(doc);
  if (base.pageKind !== 'web_search' || base.results.length === 0) {
    return { ...base, recommendations: undefined };
  }

  try {
    const recommendations = getRecommendations({
      query: base.query,
      results: base.results,
      domainPreferences,
      limit,
    });

    return { ...base, recommendations };
  } catch (err) {
    console.error('[SearchLens] Scoring error:', err);
    return { ...base, recommendations: undefined };
  }
}
