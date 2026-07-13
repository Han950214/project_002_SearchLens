import assert from 'node:assert/strict';
import type { ScoreReason, SearchResult } from '../src/models/search-result';
import {
  ENTITY_RULES,
  matchEntityDomain,
  resolveQueryEntity,
} from '../src/rules/entity-rules';
import { getRecommendations } from '../src/scoring/recommendation-engine';
import { detectIntent } from '../src/scoring/query-intent';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'result',
    title: '普通结果',
    url: 'https://example.com/',
    domain: 'example.com',
    displayUrl: 'example.com',
    snippet: '普通摘要',
    originalRank: 1,
    sourceEngine: 'baidu',
    isAdOrPromoted: false,
    detectedType: 'unknown',
    score: 0,
    reasons: [],
    confidence: 'unknown',
    ...overrides,
  };
}

function recommend(
  query: string,
  result: SearchResult,
  domainPreferences: Record<string, 'promote' | 'demote' | 'hide'> = {},
) {
  return getRecommendations({ query, results: [result], domainPreferences });
}

function reasonCodes(reasons: ScoreReason[]): string[] {
  return reasons.map(reason => reason.code);
}

function assertNoEntityOfficialReason(reasons: ScoreReason[]): void {
  assert.equal(reasons.some(reason => reason.code.startsWith('official_domain_')), false);
}

assert.equal(ENTITY_RULES.length, 12, 'entity rule count stays within the stage limit');
assert.deepEqual(ENTITY_RULES.map(rule => rule.label), [
  '微信', '企业微信', 'QQ', '钉钉', '飞书', '支付宝',
  '淘宝', '京东', 'GitHub', 'Python', 'Node.js', 'VS Code',
]);

// Correct query entity and result domain produce one entity-aware official reason.
for (const [query, domain] of [
  ['微信官网', 'weixin.qq.com'],
  ['QQ官网', 'im.qq.com'],
  ['GitHub官网', 'github.com'],
  ['VS Code官网', 'code.visualstudio.com'],
] as const) {
  const scored = recommend(query, makeResult({ title: query, domain, displayUrl: domain })).all[0];
  const codes = reasonCodes(scored.reasons);
  assert.equal(codes.filter(code => code === 'official_domain_match').length, 1, `${query} official match`);
  assert.equal(codes.includes('trusted_source'), false, `${query} entity evidence is not double-counted`);
}

// Cross-brand and entity-free queries do not inherit official or trusted-source evidence.
for (const [query, domain] of [
  ['微信官网', 'im.qq.com'],
  ['QQ官网', 'weixin.qq.com'],
  ['支付宝官网', 'taobao.com'],
  ['普通软件下载', 'weixin.qq.com'],
  ['技术文档', 'github.com'],
  ['登录入口', 'im.qq.com'],
] as const) {
  const scored = recommend(query, makeResult({ title: query, domain, displayUrl: domain })).all[0];
  assertNoEntityOfficialReason(scored.reasons);
  assert.equal(reasonCodes(scored.reasons).includes('trusted_source'), false);
}

assert.deepEqual([
  detectIntent('微信官网'),
  detectIntent('微信官方下载'),
  detectIntent('微信登录'),
  detectIntent('微信文档'),
  detectIntent('微信'),
], ['official_site', 'download', 'login', 'official_docs', 'general']);

// Multiple different entities are a conflict and never select the first match.
for (const query of ['微信 QQ 官网', 'GitHub VS Code 下载']) {
  const entityMatch = resolveQueryEntity(query);
  assert.equal(entityMatch.status, 'conflict');
  const domain = query.startsWith('微信') ? 'weixin.qq.com' : 'github.com';
  assertNoEntityOfficialReason(
    recommend(query, makeResult({ title: query, domain, displayUrl: domain })).all[0].reasons,
  );
}

// Alias matching is case-insensitive where appropriate and conservative at boundaries.
for (const [query, entityId] of [
  ['企业微信官网', 'wecom'],
  ['GITHUB 官网', 'github'],
  ['Python 下载', 'python'],
  ['Node.js 下载', 'nodejs'],
  ['nodejs 下载', 'nodejs'],
  ['VS Code 官网', 'vscode'],
  ['vscode 官网', 'vscode'],
] as const) {
  const match = resolveQueryEntity(query);
  assert.equal(match.status, 'matched', query);
  assert.equal(match.status === 'matched' && match.entity.id, entityId, query);
}
for (const query of ['notgithub', 'vscodepro', 'node', '微', 'fakeqqsite']) {
  assert.equal(resolveQueryEntity(query).status, 'unmatched', query);
}

// Exact, explicitly allowed subdomain, broad QQ subdomain, similar-domain, and suffix tricks.
const githubMatch = resolveQueryEntity('GitHub官网');
assert.equal(matchEntityDomain(githubMatch, 'github.com')?.matchKind, 'exact');
assert.equal(matchEntityDomain(githubMatch, 'docs.github.com')?.matchKind, 'subdomain');
assert.equal(matchEntityDomain(githubMatch, 'github.com.example.org'), undefined);

const qqMatch = resolveQueryEntity('QQ官网');
assert.equal(matchEntityDomain(qqMatch, 'im.qq.com')?.matchKind, 'exact');
for (const domain of ['qq.com', 'mail.qq.com', 'x.im.qq.com', 'notqq.com', 'fakeim.qq.com.example.org']) {
  assert.equal(matchEntityDomain(qqMatch, domain), undefined, domain);
}
const wechatMatch = resolveQueryEntity('微信官网');
for (const domain of ['fakeweixin.qq.com', 'fakeweixin.qq.com.example.org', 'notweixin.qq.com']) {
  assert.equal(matchEntityDomain(wechatMatch, domain), undefined, domain);
}

// A known entity with an incompatible intent uses the existing partial reason code.
const partial = recommend('QQ文档', makeResult({
  title: 'QQ文档', domain: 'im.qq.com', displayUrl: 'im.qq.com',
})).all[0];
assert.equal(reasonCodes(partial.reasons).includes('official_domain_partial'), true);
assert.equal(reasonCodes(partial.reasons).includes('official_domain_match'), false);
assert.equal(reasonCodes(partial.reasons).includes('trusted_source'), false);

// General entity queries remain eligible only when the entity is uniquely resolved.
const generalEntity = recommend('微信', makeResult({
  title: '微信', domain: 'weixin.qq.com', displayUrl: 'weixin.qq.com',
})).all[0];
assert.equal(reasonCodes(generalEntity.reasons).includes('official_domain_match'), true);

// Policy and user preferences retain their order and soft-scoring behavior.
const official = makeResult({
  title: '微信官网', domain: 'weixin.qq.com', displayUrl: 'weixin.qq.com',
});
const neutral = recommend('微信官网', official).all[0];
const advertised = recommend('微信官网', { ...official, isAdOrPromoted: true }).all[0];
assert.equal(reasonCodes(advertised.reasons).includes('official_domain_match'), true);
assert.equal(reasonCodes(advertised.reasons).includes('promoted_result_penalty'), true);
assert.ok(advertised.score < neutral.score);

const demoted = recommend('微信官网', official, { 'weixin.qq.com': 'demote' });
assert.equal(demoted.all.length, 1);
assert.equal(reasonCodes(demoted.all[0].reasons).includes('user_preference_lower'), true);
assert.ok(demoted.all[0].score < neutral.score);

const promoted = recommend('微信官网', official, { 'weixin.qq.com': 'promote' });
assert.equal(reasonCodes(promoted.all[0].reasons).includes('user_preference_boost'), true);
assert.ok(promoted.all[0].score > neutral.score);

const hidden = recommend('微信官网', official, { 'weixin.qq.com': 'hide' });
assert.equal(hidden.all.length, 0);
assert.equal(hidden.excluded[0].decision.reason.code, 'explicit_user_hide');
assert.equal(hidden.excluded[0].result.reasons.length, 0);

const thirdPartyTyped = recommend('微信官网下载', {
  ...official,
  detectedType: 'third_party_download_site',
}).all[0];
assert.equal(reasonCodes(thirdPartyTyped.reasons).includes('official_domain_match'), true);
assert.equal(reasonCodes(thirdPartyTyped.reasons).includes('third_party_download_penalty'), true);
assert.ok(thirdPartyTyped.score < recommend('微信官网下载', official).all[0].score);

// Reasons are unique and finite; official evidence is never duplicated as source trust.
const richResult = advertised;
const richCodes = reasonCodes(richResult.reasons);
assert.equal(new Set(richCodes).size, richCodes.length);
assert.ok(richCodes.filter(code => code === 'official_domain_match').length <= 1);
assert.ok(richCodes.filter(code => code === 'official_domain_partial').length <= 1);
assert.equal(richCodes.includes('trusted_source'), false);
for (const reason of richResult.reasons) {
  assert.ok(Number.isFinite(reason.weight), `${reason.code} weight`);
  assert.ok(Number.isFinite(reason.scoreImpact), `${reason.code} scoreImpact`);
}
assert.ok(Number.isFinite(richResult.score));

// Ranking is score-descending, rank-stable on ties, and deterministic across runs.
const rankingInput = [
  makeResult({ id: 'risk', domain: 'downcc.com', displayUrl: 'downcc.com', originalRank: 3, isAdOrPromoted: true }),
  makeResult({ id: 'official', title: '微信官网', domain: 'weixin.qq.com', displayUrl: 'weixin.qq.com', originalRank: 2 }),
  makeResult({ id: 'tie-2', domain: 'same.example.com', displayUrl: 'same.example.com', originalRank: 4 }),
  makeResult({ id: 'tie-1', domain: 'same.example.com', displayUrl: 'same.example.com', originalRank: 1 }),
];
const firstRun = getRecommendations({ query: '微信官网', results: rankingInput }).all;
const secondRun = getRecommendations({ query: '微信官网', results: rankingInput }).all;
for (let index = 1; index < firstRun.length; index += 1) {
  assert.ok(firstRun[index - 1].score >= firstRun[index].score);
}
assert.ok(firstRun.findIndex(result => result.id === 'tie-1') < firstRun.findIndex(result => result.id === 'tie-2'));
assert.deepEqual(secondRun, firstRun);

console.log('=== v0.4-B Entity-Aware Official Matching tests passed ===');
