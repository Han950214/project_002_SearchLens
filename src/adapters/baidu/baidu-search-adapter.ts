/**
 * BaiduSearchAdapter — Main adapter orchestrator for Baidu search pages.
 * Section 9.1, M2 of dev doc.
 *
 * Coordinates: page detection, result extraction, promoted detection.
 * All logic is local-only, no network requests.
 */

import type { SearchResult } from '../../models/search-result';
import { detectPageKind, extractSearchQuery } from './page-kind-detector';
import { extractResults } from './result-extractor';
import type { PageKind } from './page-kind-detector';

export type { PageKind };

export interface AdapterOutput {
  pageKind: PageKind;
  query: string;
  results: SearchResult[];
  error?: string;
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
