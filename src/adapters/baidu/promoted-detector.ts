/**
 * Identify Baidu promoted results using reliable M2 extraction signals only.
 */

const PROMOTED_CONTAINER_CLASSES = ['ec_result', 'ec_wise_ad'];
const AD_MARKER_SELECTORS = [
  '[data-tu="ad"]',
  '[data-click*="tuiguang"]',
  '.c-icon-bear',
  '.ec-tuiguang',
  '.ec-ad',
];

/** Check whether a single result element is promoted/ad content. */
export function isPromotedResult(element: Element): boolean {
  const className = element.className?.toString() ?? '';
  if (PROMOTED_CONTAINER_CLASSES.some(cls => className.split(/\s+/).includes(cls))) {
    return true;
  }

  if (AD_MARKER_SELECTORS.some(selector => element.querySelector(selector))) {
    return true;
  }

  const text = element.textContent ?? '';
  return text.includes('\u5e7f\u544a');
}
