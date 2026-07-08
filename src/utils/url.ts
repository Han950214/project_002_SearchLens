const HTTP_URL_RE = /^https?:\/\//i;

const BAIDU_REDIRECT_PATHS = [
  '/link',
  '/sf/vsearch',
];

/** True when text is an absolute http(s) URL. */
export function isHttpUrl(text: string): boolean {
  return HTTP_URL_RE.test(text.trim());
}

/** True for hrefs that should never be treated as result targets. */
export function isInvalidResultHref(href: string): boolean {
  const cleaned = href.trim().toLowerCase();
  return (
    cleaned === '' ||
    cleaned === '#' ||
    cleaned.startsWith('javascript:') ||
    cleaned.startsWith('void(')
  );
}

/** True when a URL is a Baidu redirect wrapper rather than a real target. */
export function isBaiduRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://www.baidu.com');
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('baidu.com') && BAIDU_REDIRECT_PATHS.some(path => parsed.pathname.startsWith(path));
  } catch {
    return false;
  }
}

/**
 * Try to extract the real target URL from a Baidu redirect link.
 * Returns the resolved target URL, or undefined if resolution fails.
 * Never returns the raw baidu.com redirect link as a fallback.
 */
export function resolveBaiduUrl(href: string): string | undefined {
  if (isInvalidResultHref(href)) return undefined;

  try {
    const parsed = new URL(href, href.startsWith('/') ? 'https://www.baidu.com' : undefined);
    const host = parsed.hostname.toLowerCase();

    if (!host.endsWith('baidu.com')) {
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
    }

    if (!isBaiduRedirectUrl(parsed.href)) {
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
    }

    const params = ['url', 'u', 'target', 'link', 'redirect'];
    for (const name of params) {
      const value = parsed.searchParams.get(name);
      const decoded = value ? decodeHttpUrl(value) : undefined;
      if (decoded) return decoded;
    }

    for (const [, value] of parsed.searchParams) {
      const decoded = decodeHttpUrl(value);
      if (decoded) return decoded;
    }

    return undefined;
  } catch {
    const match = href.match(/[?&](?:url|u|target|link|redirect)=([^&]+)/i);
    return match ? decodeHttpUrl(match[1]) : undefined;
  }
}

/** Extract display-friendly host from a URL or hostname string. */
export function extractDisplayUrl(text: string): string {
  try {
    const parsed = new URL(isHttpUrl(text) ? text : `https://${text}`);
    return parsed.hostname.replace(/^www\./i, '').trim();
  } catch {
    return text.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').trim();
  }
}

/** Parse visible display-url text into a conservative http(s) URL candidate. */
export function parseDisplayUrlCandidate(text: string): string | undefined {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\.\.\.$/, '')
    .trim();
  if (!cleaned || isInvalidResultHref(cleaned)) return undefined;

  const firstToken = cleaned.split(/[ >|]+/)[0]?.trim().replace(/\/$/, '');
  if (!firstToken) return undefined;

  const candidate = isHttpUrl(firstToken) ? firstToken : `https://${firstToken}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname.includes('.')) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function decodeHttpUrl(raw: string): string | undefined {
  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
    candidates.push(decodeURIComponent(decodeURIComponent(raw)));
  } catch {
    // Keep the undecoded candidate.
  }

  for (const value of candidates) {
    const trimmed = value.trim();
    if (isHttpUrl(trimmed)) return trimmed;
  }

  return undefined;
}
