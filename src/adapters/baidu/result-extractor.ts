/**
 * Extract search results from Baidu DOM without treating Baidu redirect
 * wrappers or placeholder links as real result targets.
 */

import type { SearchResult, ResultType } from '../../models/search-result';
import { extractDomain } from '../../utils/domain';
import {
  extractDisplayUrl,
  isBaiduRedirectUrl,
  isHttpUrl,
  isInvalidResultHref,
  parseDisplayUrlCandidate,
  resolveBaiduUrl,
} from '../../utils/url';
import { isPromotedResult } from './promoted-detector';

const DIAG_PREFIX = '[SearchLens:extractor]';
const UNKNOWN_SOURCE = 'unknown';
const RESULT_CONTAINER_SELECTOR = 'div.c-container, div.ec_result, div.ec_wise_ad, div.result-op';

const BAIDU_DOMAIN_CLASSES: Record<string, ResultType> = {
  'baike.baidu.com': 'baidu_baike',
  'zhidao.baidu.com': 'baidu_zhidao',
  'wenku.baidu.com': 'baidu_wenku',
  'tieba.baidu.com': 'baidu_tieba',
  'baijiahao.baidu.com': 'baijiahao',
};

const TARGET_ATTRS = [
  'mu',
  'data-url',
  'data-mu',
  'data-href',
  'data-rhref',
];

function isContainerVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) <= 0) return false;
  return true;
}

function isInsideSearchLensPanel(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.id === 'searchlens-panel') return true;
    cur = cur.parentElement;
  }
  return false;
}

function isGenericBaiduTarget(url: string): boolean {
  const domain = extractDomain(url);
  return domain === 'baidu.com' || isBaiduRedirectUrl(url);
}

function toTrustedTargetUrl(candidate: string): string | undefined {
  const resolved = resolveBaiduUrl(candidate);
  if (!resolved || !isHttpUrl(resolved)) return undefined;
  if (isGenericBaiduTarget(resolved)) return undefined;
  return resolved;
}

function findUrlInJson(value: unknown): string | undefined {
  if (typeof value === 'string') return toTrustedTargetUrl(value);
  if (!value || typeof value !== 'object') return undefined;

  for (const entry of Object.values(value as Record<string, unknown>)) {
    const found = findUrlInJson(entry);
    if (found) return found;
  }

  return undefined;
}

function findAttributeTarget(element: Element): string | undefined {
  for (const attr of TARGET_ATTRS) {
    const value = element.getAttribute(attr);
    const found = value ? toTrustedTargetUrl(value) : undefined;
    if (found) return found;
  }

  const dataTools = element.getAttribute('data-tools');
  if (dataTools) {
    try {
      const found = findUrlInJson(JSON.parse(dataTools));
      if (found) return found;
    } catch {
      const found = toTrustedTargetUrl(dataTools);
      if (found) return found;
    }
  }

  return undefined;
}

function findTargetUrl(element: Element, titleLink: Element | null, rawHref: string, showUrlText: string): string | undefined {
  if (!isInvalidResultHref(rawHref)) {
    const fromHref = toTrustedTargetUrl(rawHref);
    if (fromHref) return fromHref;
  }

  const scopedElements = [
    ...(titleLink ? [titleLink] : []),
    element,
    ...Array.from(element.querySelectorAll('a')),
  ];

  for (const candidateElement of scopedElements) {
    const fromAttrs = findAttributeTarget(candidateElement);
    if (fromAttrs) return fromAttrs;

    const href = candidateElement.getAttribute('href');
    if (href && !isInvalidResultHref(href)) {
      const fromNestedHref = toTrustedTargetUrl(href);
      if (fromNestedHref) return fromNestedHref;
    }
  }

  return showUrlText ? parseDisplayUrlCandidate(showUrlText) : undefined;
}

function getSourceDisplay(resolvedUrl: string | undefined): { domain: string; displayUrl: string } {
  if (!resolvedUrl) return { domain: UNKNOWN_SOURCE, displayUrl: UNKNOWN_SOURCE };

  const domain = extractDomain(resolvedUrl);
  if (!domain || domain === 'baidu.com') return { domain: UNKNOWN_SOURCE, displayUrl: UNKNOWN_SOURCE };

  return {
    domain,
    displayUrl: extractDisplayUrl(resolvedUrl),
  };
}

function getTitle(element: Element, titleLink: Element | null): string {
  const h3 = element.querySelector('h3');
  return titleLink?.textContent?.trim() || h3?.textContent?.trim() || '';
}

export function extractResults(doc: Document = document): SearchResult[] {
  const contentLeft = doc.getElementById('content_left');
  if (!contentLeft) {
    console.log(DIAG_PREFIX, 'No #content_left found');
    return [];
  }

  const rawContainers = contentLeft.querySelectorAll(RESULT_CONTAINER_SELECTOR);
  if (rawContainers.length === 0) return [];

  const rawSet = new Set(Array.from(rawContainers));
  const outermost: Element[] = [];

  for (const el of rawContainers) {
    let ancestor = el.parentElement;
    let nested = false;
    while (ancestor && ancestor !== contentLeft) {
      if (rawSet.has(ancestor)) {
        nested = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!nested) outermost.push(el);
  }

  const visible = outermost.filter(el => isContainerVisible(el) && !isInsideSearchLensPanel(el));
  const results: SearchResult[] = [];

  visible.forEach((el, index) => {
    const rank = index + 1;
    const result = extractSingleResult(el, rank);
    if (result) results.push(result);
  });

  const seenTitles = new Set<string>();
  return results.filter(result => {
    const key = result.title.trim().toLowerCase();
    if (!key) return true;
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
}

function extractSingleResult(element: Element, rank: number): SearchResult | null {
  const titleLink = element.querySelector('h3.t > a, h3 > a');
  const title = getTitle(element, titleLink);
  if (!title) return null;

  const rawHref = titleLink?.getAttribute('href') ?? '';
  const showUrlText = element.querySelector('.c-showurl')?.textContent?.trim() ?? '';
  const snippet = element.querySelector('.c-abstract, .c-color-gray')?.textContent?.trim() ?? '';
  const resolvedUrl = findTargetUrl(element, titleLink, rawHref, showUrlText);
  const source = getSourceDisplay(resolvedUrl);
  const isAd = isPromotedResult(element);
  const detectedType = classifyBaiduType(source.domain, isAd);

  return {
    id: `baidu-${rank}`,
    title,
    url: resolvedUrl ?? '',
    resolvedUrl,
    domain: source.domain,
    displayUrl: source.displayUrl,
    snippet: snippet || undefined,
    originalRank: rank,
    sourceEngine: 'baidu',
    isAdOrPromoted: isAd,
    detectedType,
    score: 0,
    reasons: [],
    confidence: 'unknown',
  };
}

function classifyBaiduType(domain: string, isAd: boolean): ResultType {
  if (isAd) return 'ad_or_promoted';

  for (const [baiduDomain, type] of Object.entries(BAIDU_DOMAIN_CLASSES)) {
    if (domain === baiduDomain) return type;
  }

  if (domain === 'github.com') return 'github_repo';
  return 'unknown';
}
