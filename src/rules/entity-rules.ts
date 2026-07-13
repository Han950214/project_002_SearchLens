import type { QueryIntent } from '../models/search-result';
import { normalizeDomain } from '../utils/domain';

export interface EntityDomainRule {
  domain: string;
  allowSubdomains: boolean;
  supportedIntents: readonly QueryIntent[];
}

export interface EntityRule {
  id: string;
  label: string;
  aliases: readonly string[];
  domains: readonly EntityDomainRule[];
}

export type EntityMatch =
  | { status: 'unmatched' }
  | { status: 'matched'; entity: EntityRule; alias: string }
  | { status: 'conflict'; entities: readonly EntityRule[] };

export interface EntityDomainMatch {
  entity: EntityRule;
  domainRule: EntityDomainRule;
  matchKind: 'exact' | 'subdomain';
}

export const ENTITY_RULES: readonly EntityRule[] = [
  {
    id: 'wechat',
    label: '微信',
    aliases: ['微信'],
    domains: [{
      domain: 'weixin.qq.com',
      allowSubdomains: false,
      supportedIntents: ['official_site', 'download', 'official_docs', 'login', 'general'],
    }],
  },
  {
    id: 'wecom',
    label: '企业微信',
    aliases: ['企业微信'],
    domains: [{
      domain: 'work.weixin.qq.com',
      allowSubdomains: false,
      supportedIntents: ['official_site', 'download', 'login', 'general'],
    }],
  },
  {
    id: 'qq',
    label: 'QQ',
    aliases: ['qq'],
    domains: [{
      domain: 'im.qq.com',
      allowSubdomains: false,
      supportedIntents: ['official_site', 'download', 'login', 'general'],
    }],
  },
  {
    id: 'dingtalk',
    label: '钉钉',
    aliases: ['钉钉'],
    domains: [{
      domain: 'dingtalk.com',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'download', 'login', 'general'],
    }],
  },
  {
    id: 'feishu',
    label: '飞书',
    aliases: ['飞书'],
    domains: [
      {
        domain: 'feishu.cn',
        allowSubdomains: true,
        supportedIntents: ['official_site', 'download', 'login', 'general'],
      },
      {
        domain: 'larksuite.com',
        allowSubdomains: true,
        supportedIntents: ['official_site', 'download', 'login', 'general'],
      },
    ],
  },
  {
    id: 'alipay',
    label: '支付宝',
    aliases: ['支付宝'],
    domains: [{
      domain: 'alipay.com',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'login', 'general'],
    }],
  },
  {
    id: 'taobao',
    label: '淘宝',
    aliases: ['淘宝'],
    domains: [{
      domain: 'taobao.com',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'general'],
    }],
  },
  {
    id: 'jd',
    label: '京东',
    aliases: ['京东'],
    domains: [{
      domain: 'jd.com',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'general'],
    }],
  },
  {
    id: 'github',
    label: 'GitHub',
    aliases: ['github'],
    domains: [{
      domain: 'github.com',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'download', 'general'],
    }],
  },
  {
    id: 'python',
    label: 'Python',
    aliases: ['python'],
    domains: [{
      domain: 'python.org',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'download', 'general'],
    }],
  },
  {
    id: 'nodejs',
    label: 'Node.js',
    aliases: ['node.js', 'nodejs'],
    domains: [{
      domain: 'nodejs.org',
      allowSubdomains: true,
      supportedIntents: ['official_site', 'download', 'general'],
    }],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    aliases: ['vs code', 'vscode'],
    domains: [
      {
        domain: 'vscode.dev',
        allowSubdomains: true,
        supportedIntents: ['official_site', 'download', 'general'],
      },
      {
        domain: 'code.visualstudio.com',
        allowSubdomains: false,
        supportedIntents: ['official_site', 'download', 'general'],
      },
    ],
  },
];

interface AliasHit {
  entity: EntityRule;
  alias: string;
  start: number;
  end: number;
}

const CHINESE_INTENT_SUFFIXES = [
  '官网', '官方网站', '官方', '官方下载', '下载', '登录', '文档',
  '客户端', '安装包', '首页', '主页', 'api', 'sdk',
];

export function normalizeEntityQuery(query: string): string {
  return query.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

function isBoundaryCharacter(character: string | undefined): boolean {
  return character === undefined || /[\s\p{P}\p{S}]/u.test(character);
}

function findEnglishAlias(query: string, alias: string, entity: EntityRule): AliasHit | undefined {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[^a-z0-9])(${escapedAlias})(?=$|[^a-z0-9])`, 'i').exec(query);
  if (!match) return undefined;

  const start = match.index + match[1].length;
  return { entity, alias, start, end: start + match[2].length };
}

function findChineseAlias(query: string, alias: string, entity: EntityRule): AliasHit | undefined {
  let start = query.indexOf(alias);

  while (start >= 0) {
    const end = start + alias.length;
    const suffix = query.slice(end);
    const hasPrefixBoundary = isBoundaryCharacter(query[start - 1]);
    const hasSuffixBoundary = isBoundaryCharacter(query[end])
      || CHINESE_INTENT_SUFFIXES.some(marker => suffix.startsWith(marker));

    if (hasPrefixBoundary && hasSuffixBoundary) {
      return { entity, alias, start, end };
    }

    start = query.indexOf(alias, start + 1);
  }

  return undefined;
}

function findAlias(query: string, alias: string, entity: EntityRule): AliasHit | undefined {
  const normalizedAlias = normalizeEntityQuery(alias);
  return /[a-z0-9]/i.test(normalizedAlias)
    ? findEnglishAlias(query, normalizedAlias, entity)
    : findChineseAlias(query, normalizedAlias, entity);
}

export function resolveQueryEntity(query: string): EntityMatch {
  const normalizedQuery = normalizeEntityQuery(query);
  if (!normalizedQuery) return { status: 'unmatched' };

  const hits: AliasHit[] = [];
  for (const entity of ENTITY_RULES) {
    for (const alias of entity.aliases) {
      const hit = findAlias(normalizedQuery, alias, entity);
      if (hit) hits.push(hit);
    }
  }

  const nonContainedHits = hits.filter(hit => !hits.some(other => (
    other.entity.id !== hit.entity.id
    && other.start <= hit.start
    && other.end >= hit.end
    && (other.end - other.start) > (hit.end - hit.start)
  )));

  const hitsByEntity = new Map<string, AliasHit>();
  for (const hit of nonContainedHits) {
    const current = hitsByEntity.get(hit.entity.id);
    if (!current || hit.alias.length > current.alias.length) {
      hitsByEntity.set(hit.entity.id, hit);
    }
  }

  const uniqueHits = [...hitsByEntity.values()];
  if (uniqueHits.length === 0) return { status: 'unmatched' };
  if (uniqueHits.length === 1) {
    return {
      status: 'matched',
      entity: uniqueHits[0].entity,
      alias: uniqueHits[0].alias,
    };
  }

  return {
    status: 'conflict',
    entities: uniqueHits.map(hit => hit.entity).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function matchEntityDomain(
  entityMatch: EntityMatch,
  candidateDomain: string,
): EntityDomainMatch | undefined {
  if (entityMatch.status !== 'matched') return undefined;

  const normalizedCandidate = normalizeDomain(candidateDomain);
  if (!normalizedCandidate) return undefined;

  for (const domainRule of entityMatch.entity.domains) {
    const normalizedRuleDomain = normalizeDomain(domainRule.domain);
    if (normalizedCandidate === normalizedRuleDomain) {
      return { entity: entityMatch.entity, domainRule, matchKind: 'exact' };
    }
    if (
      domainRule.allowSubdomains
      && normalizedCandidate.endsWith(`.${normalizedRuleDomain}`)
    ) {
      return { entity: entityMatch.entity, domainRule, matchKind: 'subdomain' };
    }
  }

  return undefined;
}

export function supportsEntityDomainIntent(
  domainRule: EntityDomainRule,
  intent: QueryIntent,
): boolean {
  const compatibleIntent = intent === 'sensitive_official' ? 'official_site' : intent;
  return domainRule.supportedIntents.includes(compatibleIntent);
}
