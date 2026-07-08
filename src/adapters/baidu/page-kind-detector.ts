/**
 * PageKindDetector — Determine what kind of Baidu page we are on.
 * Section 6.3, 12.1 of dev doc.
 */

export type PageKind = 'web_search' | 'unsupported_tab' | 'not_baidu_search';

/**
 * Check if the current page is a supported Baidu web search results page.
 * Returns the page kind for the adapter to act on.
 */
export function detectPageKind(doc: Document = document): PageKind {
  // Must be a Baidu search results page
  const url = doc.URL;
  if (!url.includes('baidu.com/s?')) {
    return 'not_baidu_search';
  }

  // Check if we are on the web search tab (not image, video, etc.)
  const activeTab = doc.querySelector('#s_tab .cur, .s_tab .cur, .s_tab_inner .cur');
  if (activeTab) {
    const text = activeTab.textContent?.trim() ?? '';
    if (text !== '' && text !== '网页') {
      return 'unsupported_tab';
    }
  }

  return 'web_search';
}

/**
 * Extract the search query from the Baidu search input.
 */
export function extractSearchQuery(doc: Document = document): string {
  const kw = doc.querySelector<HTMLInputElement>('#kw');
  return kw?.value?.trim() ?? '';
}
