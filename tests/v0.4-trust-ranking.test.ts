import assert from 'node:assert/strict';
import type { ScoreReason, SearchResult } from '../src/models/search-result';
import {
  DEFAULT_WEIGHTS,
  detectIntent,
  scoreResult,
  type ScoringContext,
} from '../src/scoring/scoring-engine';
import {
  getCompactSourceTag,
  getRecommendations,
  toDisplayItem,
} from '../src/scoring/recommendation-engine';
import { evaluateTrustPolicy } from '../src/scoring/trust-policy';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'result',
    title: '普通搜索结果',
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

function score(
  result: SearchResult,
  overrides: Partial<ScoringContext> = {},
) {
  return scoreResult(result, {
    query: '普通查询',
    intent: 'general',
    userPreferences: {},
    ...overrides,
  });
}

function reasonByCode(reasons: ScoreReason[], code: string): ScoreReason {
  const reason = reasons.find(item => item.code === code);
  assert.ok(reason, `missing reason ${code}`);
  return reason;
}

function assertFiniteScoring(result: ReturnType<typeof scoreResult>): void {
  assert.ok(Number.isFinite(result.score), 'score is finite');
  for (const reason of result.reasons) {
    assert.ok(Number.isFinite(reason.weight), `${reason.code} weight is finite`);
    assert.ok(Number.isFinite(reason.scoreImpact), `${reason.code} scoreImpact is finite`);
  }
}

// Default weights preserve the pre-v0.4 representative scores.
{
  const neutral = scoreResult(makeResult({
    title: '微信电脑版下载',
    snippet: '微信官方下载页面',
  }), {
    query: '', intent: 'general', userPreferences: {},
  });
  const official = scoreResult(makeResult({
    title: '微信官网',
    url: 'https://weixin.qq.com/',
    domain: 'weixin.qq.com',
    displayUrl: 'weixin.qq.com',
    snippet: '微信官方网站',
  }), {
    query: '微信官网', intent: 'official_site', userPreferences: {},
  });

  assert.equal(neutral.score, 18);
  assert.equal(official.score, 76);
  assert.deepEqual(DEFAULT_WEIGHTS, {
    officialSignal: 40,
    intentMatch: 15,
    sourceTrust: 20,
    userPreference: 15,
    docsOrRepoBonus: 10,
    adRisk: -50,
    thirdPartyDownloadRisk: -30,
    seoMarketingRisk: -20,
    suspiciousDomainRisk: -25,
  });
}

// Each custom positive weight reaches its signal and changes behavior.
{
  const officialResult = makeResult({
    title: '微信官网', domain: 'weixin.qq.com', displayUrl: 'weixin.qq.com', snippet: '微信官方网站',
  });
  const officialDefault = score(officialResult, { query: '微信官网', intent: 'official_site' });
  const officialCustom = score(officialResult, {
    query: '微信官网', intent: 'official_site', weights: { officialSignal: 10 },
  });
  assert.notEqual(officialCustom.score, officialDefault.score);
  assert.equal(reasonByCode(officialCustom.reasons, 'official_domain_match').weight, 10);

  const intentResult = makeResult({ title: '产品下载客户端', snippet: '安装包 download' });
  const intentDefault = score(intentResult, { query: '产品下载', intent: 'download' });
  const intentCustom = score(intentResult, {
    query: '产品下载', intent: 'download', weights: { intentMatch: 60 },
  });
  assert.notEqual(intentCustom.score, intentDefault.score);
  assert.equal(reasonByCode(intentCustom.reasons, 'intent_match').weight, 60);

  const preferredResult = makeResult({ domain: 'preferred.example.com' });
  const preferenceDefault = score(preferredResult, {
    userPreferences: { 'preferred.example.com': 'promote' },
  });
  const preferenceCustom = score(preferredResult, {
    userPreferences: { 'preferred.example.com': 'promote' },
    weights: { userPreference: 60 },
  });
  assert.notEqual(preferenceCustom.score, preferenceDefault.score);
  assert.equal(reasonByCode(preferenceCustom.reasons, 'user_preference_boost').weight, 60);
}

// Custom risk weights and Partial merging are used by the actual signal path.
{
  const promoted = makeResult({
    domain: 'weixin.qq.com',
    displayUrl: 'weixin.qq.com',
    isAdOrPromoted: true,
  });
  const defaultPenalty = score(promoted);
  const customPenalty = score(promoted, { weights: { adRisk: -5 } });

  assert.ok(customPenalty.score > defaultPenalty.score);
  assert.equal(reasonByCode(customPenalty.reasons, 'promoted_result_penalty').weight, -5);
  assert.equal(reasonByCode(customPenalty.reasons, 'trusted_source').weight, DEFAULT_WEIGHTS.sourceTrust);
  assert.equal(reasonByCode(customPenalty.reasons, 'promoted_result_penalty').scoreImpact, -5);
}

// High-trust non-official sources use the current UI contract; legacy code remains compatible.
{
  const trusted = score(makeResult({
    domain: 'azure.com',
    displayUrl: 'azure.com',
  }));
  const reason = reasonByCode(trusted.reasons, 'trusted_source');
  const currentTag = getCompactSourceTag(trusted.reasons);
  const legacyTag = getCompactSourceTag([{ ...reason, code: 'high_trust_domain' }]);

  assert.equal(trusted.reasons.some(item => item.code.startsWith('official_domain_')), false);
  assert.deepEqual(currentTag, { label: '可信来源', className: 'tag-trusted' });
  assert.deepEqual(legacyTag, currentTag);
}

// Top reason follows structured score impact, not raw weight sign or magnitude.
{
  const promotedTrusted = score(makeResult({
    domain: 'azure.com',
    displayUrl: 'azure.com',
    isAdOrPromoted: true,
  }));
  const trustedReason = reasonByCode(promotedTrusted.reasons, 'trusted_source');
  const promotedReason = reasonByCode(promotedTrusted.reasons, 'promoted_result_penalty');

  assert.equal(promotedTrusted.score, 0);
  assert.ok(trustedReason.scoreImpact > 0);
  assert.ok(Math.abs(promotedReason.scoreImpact) > Math.abs(trustedReason.scoreImpact));
  assert.equal(toDisplayItem(promotedTrusted, 1).topReason, '推广结果');

  const structuredReasons: ScoreReason[] = [
    {
      code: 'small_positive', label: '小幅正向', weight: 40, scoreImpact: 1,
      category: 'positive', effect: 'increase', confidence: 'medium',
    },
    {
      code: 'user_preference_lower', label: '用户已降低', weight: 15, scoreImpact: -6,
      category: 'user_preference', effect: 'decrease', confidence: 'high',
    },
  ];
  assert.equal(
    toDisplayItem({ ...promotedTrusted, reasons: structuredReasons }, 1).topReason,
    '用户已降低',
  );

  const tiedReasons: ScoreReason[] = [
    {
      code: 'first_tie', label: '先出现', weight: 1, scoreImpact: 5,
      category: 'positive', effect: 'increase', confidence: 'medium',
    },
    {
      code: 'second_tie', label: '后出现', weight: -50, scoreImpact: -5,
      category: 'negative', effect: 'decrease', confidence: 'medium',
    },
  ];
  assert.equal(toDisplayItem({ ...promotedTrusted, reasons: tiedReasons }, 1).topReason, '先出现');
  assert.equal(
    toDisplayItem({
      ...promotedTrusted,
      reasons: tiedReasons.map(reason => ({ ...reason, scoreImpact: 0 })),
    }, 1).topReason,
    '先出现',
  );

  const policyFirst: ScoreReason[] = [
    promotedReason,
    {
      code: 'visible_policy', label: '策略动作', weight: 0, scoreImpact: 0,
      category: 'policy', effect: 'decrease', confidence: 'high',
    },
  ];
  assert.equal(toDisplayItem({ ...promotedTrusted, reasons: policyFirst }, 1).topReason, '策略动作');
}

// Invalid overrides fall back; valid zero and finite overrides remain effective.
{
  const official = makeResult({
    title: '微信官网',
    domain: 'weixin.qq.com',
    displayUrl: 'weixin.qq.com',
    snippet: '微信官方网站',
  });
  const officialContext = { query: '微信官网', intent: 'official_site' as const };
  const officialDefault = score(official, officialContext);
  const invalidOfficialWeights = [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -40,
  ];

  for (const officialSignal of invalidOfficialWeights) {
    const result = score(official, {
      ...officialContext,
      weights: { officialSignal },
    });
    assert.equal(result.score, officialDefault.score);
    assert.equal(
      reasonByCode(result.reasons, 'official_domain_match').weight,
      DEFAULT_WEIGHTS.officialSignal,
    );
    assertFiniteScoring(result);
  }

  const promoted = makeResult({
    domain: 'azure.com',
    displayUrl: 'azure.com',
    isAdOrPromoted: true,
  });
  const promotedDefault = score(promoted);
  for (const adRisk of [
    undefined,
    10,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const result = score(promoted, { weights: { adRisk } });
    assert.equal(result.score, promotedDefault.score);
    assert.equal(
      reasonByCode(result.reasons, 'promoted_result_penalty').weight,
      DEFAULT_WEIGHTS.adRisk,
    );
    assertFiniteScoring(result);
  }

  const zeroOfficial = score(official, {
    ...officialContext,
    weights: { officialSignal: 0 },
  });
  const zeroOfficialReason = reasonByCode(zeroOfficial.reasons, 'official_domain_match');
  assert.equal(zeroOfficialReason.weight, 0);
  assert.equal(zeroOfficialReason.scoreImpact, 0);
  assert.notEqual(zeroOfficial.score, officialDefault.score);
  assertFiniteScoring(zeroOfficial);

  const zeroAdRisk = score(promoted, { weights: { adRisk: 0 } });
  const zeroAdReason = reasonByCode(zeroAdRisk.reasons, 'promoted_result_penalty');
  assert.equal(zeroAdReason.weight, 0);
  assert.equal(zeroAdReason.scoreImpact, 0);
  assert.ok(zeroAdRisk.score > promotedDefault.score);
  assertFiniteScoring(zeroAdRisk);

  const extremeOfficial = score(official, {
    ...officialContext,
    weights: { officialSignal: Number.MAX_VALUE },
  });
  assert.equal(
    reasonByCode(extremeOfficial.reasons, 'official_domain_match').weight,
    Number.MAX_VALUE,
  );
  assertFiniteScoring(extremeOfficial);

  const extremeAdRisk = score(promoted, { weights: { adRisk: -Number.MAX_VALUE } });
  const extremeAdReason = reasonByCode(extremeAdRisk.reasons, 'promoted_result_penalty');
  assert.equal(extremeAdReason.weight, -Number.MAX_VALUE);
  assert.ok(extremeAdReason.scoreImpact <= 0);
  assertFiniteScoring(extremeAdRisk);
}

// Policy exclusions run first; soft heuristics remain visible score penalties.
{
  const hidden = makeResult({ domain: 'hidden.example.com', isAdOrPromoted: true });
  const hiddenDecision = evaluateTrustPolicy(hidden, { 'hidden.example.com': 'hide' });
  assert.equal(hiddenDecision.action, 'exclude');
  if (hiddenDecision.action === 'exclude') {
    assert.deepEqual(
      [hiddenDecision.reason.code, hiddenDecision.reason.category, hiddenDecision.reason.effect],
      ['explicit_user_hide', 'policy', 'exclude'],
    );
  }

  const suspicious = makeResult({ domain: 'ordinary-risk.tk', url: 'https://ordinary-risk.tk/' });
  const recommendations = getRecommendations({
    query: '普通查询',
    results: [hidden, suspicious],
    domainPreferences: { 'hidden.example.com': 'hide' },
  });

  assert.equal(recommendations.all.length, 1);
  assert.equal(recommendations.all[0].domain, 'ordinary-risk.tk');
  assert.equal(recommendations.excluded.length, 1);
  assert.equal(recommendations.excluded[0].decision.reason.code, 'explicit_user_hide');
  assert.equal(recommendations.excluded[0].result.reasons.length, 0, 'excluded result was not soft-scored');
  assert.ok(recommendations.all[0].reasons.some(reason => reason.code === 'suspicious_domain_penalty'));
}

// Lower is a user scoring signal, not an exclusion.
{
  const result = makeResult({ domain: 'lower.example.com' });
  const neutral = getRecommendations({ query: '普通查询', results: [result] });
  const lowered = getRecommendations({
    query: '普通查询',
    results: [result],
    domainPreferences: { 'lower.example.com': 'demote' },
  });

  assert.equal(lowered.all.length, 1);
  assert.ok(lowered.all[0].score < neutral.all[0].score);
  assert.deepEqual(
    [
      reasonByCode(lowered.all[0].reasons, 'user_preference_lower').category,
      reasonByCode(lowered.all[0].reasons, 'user_preference_lower').effect,
    ],
    ['user_preference', 'decrease'],
  );
}

// Structured reasons are stable, signed consistently, and never duplicated.
{
  const result = makeResult({
    title: '微信官方下载 高速下载',
    domain: 'weixin.qq.com',
    displayUrl: 'weixin.qq.com',
    snippet: '微信官方客户端下载',
    isAdOrPromoted: true,
    detectedType: 'github_repo',
  });
  const scored = score(result, {
    query: '微信下载',
    intent: 'download',
    userPreferences: { 'weixin.qq.com': 'promote' },
  });
  const codes = scored.reasons.map(reason => reason.code);

  assert.equal(new Set(codes).size, codes.length);
  assert.equal(reasonByCode(scored.reasons, 'official_domain_match').category, 'positive');
  assert.equal(reasonByCode(scored.reasons, 'promoted_result_penalty').category, 'negative');
  assert.equal(reasonByCode(scored.reasons, 'user_preference_boost').category, 'user_preference');
  for (const reason of scored.reasons) {
    if (reason.effect === 'increase') assert.ok(reason.scoreImpact >= 0, reason.code);
    if (reason.effect === 'decrease') assert.ok(reason.scoreImpact <= 0, reason.code);
  }
}

// Ranking remains deterministic and stable on equal scores.
{
  const tied = [
    makeResult({ id: 'third', domain: 'same.example.com', originalRank: 3 }),
    makeResult({ id: 'first', domain: 'same.example.com', originalRank: 1 }),
    makeResult({ id: 'second', domain: 'same.example.com', originalRank: 2 }),
  ];
  const recommendations = getRecommendations({ query: '普通查询', results: tied });
  assert.deepEqual(recommendations.all.map(result => result.originalRank), [1, 2, 3]);
}

// Representative v0.4-A intents and result types remain locally scoreable.
{
  const scenarios = [
    ['微信官网', '微信官方网站', 'sensitive_official'],
    ['微信下载', '微信客户端下载', 'download'],
    ['微信登录', '微信登录入口', 'login'],
    ['微信 API 文档', '微信开发文档 API', 'official_docs'],
  ] as const;

  for (const [query, title, expectedIntent] of scenarios) {
    const intent = detectIntent(query);
    assert.equal(intent, expectedIntent);
    const scored = scoreResult(makeResult({
      title,
      domain: 'weixin.qq.com',
      displayUrl: 'weixin.qq.com',
    }), { query, intent, userPreferences: {} });
    assert.ok(scored.score >= 0 && scored.score <= 100);
    assert.ok(scored.reasons.some(reason => reason.code.startsWith('official_domain_')));
  }
}

console.log('=== v0.4-A Trust Ranking tests passed ===');
