import type { QueryIntent } from '../models/search-result';

const INTENT_PATTERNS: Record<QueryIntent, readonly RegExp[]> = {
  official_site: [/官网$/i, /官方网站/i, /official\s+(?:site|website)\b/i, /首页$/i, /主页$/i],
  download: [/下载/i, /download/i, /客户端/i, /安装包/i, /setup/i, /installer/i],
  official_docs: [/文档/i, /doc/i, /documentation/i, /手册/i, /api\b/i, /sdk\b/i, /开发/i],
  login: [/登录/i, /login/i, /sign\s*in/i, /扫码/i, /二维码/i],
  sensitive_official: [/官方/i, /\bofficial\b/i],
  general: [],
};

const INTENT_PRIORITY: readonly QueryIntent[] = [
  'download',
  'official_docs',
  'login',
  'official_site',
  'sensitive_official',
];

export function getIntentPatterns(intent: QueryIntent): readonly RegExp[] {
  return INTENT_PATTERNS[intent];
}

export function detectIntent(query: string): QueryIntent {
  const normalizedQuery = query.normalize('NFKC').trim();

  for (const intent of INTENT_PRIORITY) {
    if (INTENT_PATTERNS[intent].some(pattern => pattern.test(normalizedQuery))) {
      return intent;
    }
  }

  return 'general';
}
