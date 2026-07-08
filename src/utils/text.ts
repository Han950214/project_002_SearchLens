/** Check if text contains any of the given keywords (case-insensitive for Chinese) */
export function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

/** Score how many keywords match */
export function keywordMatchCount(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase())).length;
}
