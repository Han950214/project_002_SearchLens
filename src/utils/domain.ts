/** Extract domain from URL string */
export function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

/** Normalize domain: lowercase, strip www, trim */
export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '').trim();
}

/** Check if domain matches a list of official domains */
export function isOfficialDomain(domain: string, officialDomains: string[]): boolean {
  const d = normalizeDomain(domain);
  return officialDomains.some(o => normalizeDomain(o) === d || d.endsWith('.' + normalizeDomain(o)));
}
