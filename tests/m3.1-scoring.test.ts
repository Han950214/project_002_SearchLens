/**
 * M3.1 — Scoring Engine tests
 *
 * Verifies:
 *  1. scoreResult with neutral/empty context
 *  2. Official domain match produces high score
 *  3. Ad/promoted results get penalised
 *  4. Intent detection maps queries correctly
 *  5. User "hide" preference zeroes the score
 *  6. User "promote" preference boosts the score
 *  7. getRecommendations sorts by score
 *  8. getRecommendations respects limit
 *  9. Third-party download sites receive a warning and penalty
 * 10. User "demote" preference lowers the score
 * 11. Preference ordering filters hide and ranks promote above demote
 */

import assert from 'node:assert/strict';
import { scoreResult, detectIntent } from '../src/scoring/scoring-engine';
import { getRecommendations } from '../src/scoring/recommendation-engine';
import type { SearchResult } from '../src/models/search-result';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'test-1',
    title: '微信电脑版下载',
    url: 'https://weixin.qq.com/download',
    resolvedUrl: 'https://weixin.qq.com/download',
    domain: 'weixin.qq.com',
    displayUrl: 'weixin.qq.com',
    snippet: '微信官方下载页面',
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

// ─── Test 1: Empty / neutral context ─────────────────────────────────────

{
  const result = makeResult({ domain: 'example.com', displayUrl: 'example.com' });
  const ctx = { query: '', intent: 'general' as const, userPreferences: {} };
  const scored = scoreResult(result, ctx);

  assert.equal(typeof scored.score, 'number', 'score is a number');
  assert.ok(scored.score >= 0 && scored.score <= 100, `score ${scored.score} is in [0,100]`);
  assert.ok(scored.reasons.length > 0, 'at least one reason is produced');
  assert.equal(['high', 'medium', 'low', 'unknown'].includes(scored.confidence), true);

  console.log(`  Test 1 OK — neutral score: ${scored.score}, confidence: ${scored.confidence}, reasons: ${scored.reasons.length}`);
}

// ─── Test 2: Official domain match produces high score ────────────────────

{
  const result = makeResult({
    title: '微信官网',
    url: 'https://weixin.qq.com/',
    resolvedUrl: 'https://weixin.qq.com/',
    domain: 'weixin.qq.com',
    displayUrl: 'weixin.qq.com',
    snippet: '微信官方网站',
  });
  const ctx = { query: '微信官网', intent: 'official_site' as const, userPreferences: {} };
  const scored = scoreResult(result, ctx);

  assert.ok(scored.score >= 60, `official domain should score ≥60, got ${scored.score}`);
  assert.equal(scored.confidence, 'high', 'official domain match should be high confidence');
  assert.ok(scored.reasons.some(r => r.code === 'official_domain_match'), 'reason includes official_domain_match');

  console.log(`  Test 2 OK — official domain score: ${scored.score} (high), reasons: ${scored.reasons.map(r => r.code).join(', ')}`);
}

// ─── Test 3: Ad/promoted result gets penalised ───────────────────────────

{
  const result = makeResult({
    title: '下载微信',
    domain: 'downcc.com',
    displayUrl: 'downcc.com',
    isAdOrPromoted: true,
  });
  const ctx = { query: '微信下载', intent: 'download' as const, userPreferences: {} };
  const scored = scoreResult(result, ctx);

  assert.ok(scored.score <= 40, `ad result should score ≤40, got ${scored.score}`);
  assert.ok(scored.reasons.some(r => r.code === 'ad_or_promoted'), 'reason includes ad_or_promoted');

  console.log(`  Test 3 OK — ad penalised score: ${scored.score}, confidence: ${scored.confidence}`);
}

// ─── Test 4: Intent detection ────────────────────────────────────────────

{
  assert.equal(detectIntent('微信官网'), 'sensitive_official', '官网 → sensitive_official');
  assert.equal(detectIntent('微信下载'), 'download', '下载 → download');
  assert.equal(detectIntent('微信 API 文档'), 'official_docs', '文档 → official_docs');
  assert.equal(detectIntent('微信登录'), 'login', '登录 → login');
  assert.equal(detectIntent('微信 for Linux'), 'general', 'no keyword → general');

  console.log('  Test 4 OK — all intent patterns match correctly');
}

// ─── Test 5: User "hide" preference zeroes score ─────────────────────────

{
  const result = makeResult({ domain: 'bad.example.com', displayUrl: 'bad.example.com' });
  const ctx = {
    query: 'test',
    intent: 'general' as const,
    userPreferences: { 'bad.example.com': 'hide' as const },
  };
  const scored = scoreResult(result, ctx);

  assert.equal(scored.score, 0, 'hidden result should have score 0');
  assert.equal(scored.confidence, 'low', 'hidden result should be low confidence');

  console.log('  Test 5 OK — hidden result score: 0');
}

// ─── Test 6: User "promote" preference boosts score ──────────────────────

{
  const neutral = makeResult({ domain: 'neut.example.com', displayUrl: 'neut.example.com' });
  const promoted = makeResult({ domain: 'neut.example.com', displayUrl: 'neut.example.com' });

  const ctxNeutral = { query: 'test', intent: 'general' as const, userPreferences: {} };
  const ctxPromoted = { query: 'test', intent: 'general' as const, userPreferences: { 'neut.example.com': 'promote' as const } };

  const scoredNeutral = scoreResult(neutral, ctxNeutral);
  const scoredPromoted = scoreResult(promoted, ctxPromoted);

  assert.ok(scoredPromoted.score > scoredNeutral.score,
    `promoted score ${scoredPromoted.score} > neutral score ${scoredNeutral.score}`);

  console.log(`  Test 6 OK — neutral: ${scoredNeutral.score}, promoted: ${scoredPromoted.score} (boosted)`);
}

// ─── Test 7: getRecommendations sorts by score ───────────────────────────

{
  const results: SearchResult[] = [
    makeResult({ id: 'a', title: 'Low', domain: 'low.example.com', originalRank: 1 }),
    makeResult({ id: 'b', title: 'High', domain: 'weixin.qq.com', originalRank: 2 }),
    makeResult({ id: 'c', title: 'Medium', domain: 'medium.example.com', originalRank: 3 }),
  ];

  const recs = getRecommendations({ query: '微信', results });

  assert.equal(recs.all.length, 3, 'all results are present');
  // Highest score should be first (weixin.qq.com is an official domain)
  assert.equal(recs.top[0].domain, 'weixin.qq.com', 'official domain ranked first');
  assert.equal(recs.intent, 'general', 'query "微信" alone has general intent');

  console.log(`  Test 7 OK — sorted order: ${recs.top.map(r => `${r.domain}(${r.score})`).join(' > ')}`);
}

// ─── Test 8: getRecommendations respects limit ────────────────────────────

{
  const results: SearchResult[] = [
    makeResult({ id: 'a', title: 'A', domain: 'a.example.com', originalRank: 1 }),
    makeResult({ id: 'b', title: 'B', domain: 'b.example.com', originalRank: 2 }),
    makeResult({ id: 'c', title: 'C', domain: 'c.example.com', originalRank: 3 }),
    makeResult({ id: 'd', title: 'D', domain: 'd.example.com', originalRank: 4 }),
  ];

  const recs = getRecommendations({ query: 'test', results, limit: 2 });

  assert.equal(recs.top.length, 2, 'top should have 2 items');
  assert.equal(recs.all.length, 4, 'all should have 4 items');

console.log('  Test 8 OK — limit respected: top 2 of 4');
}

// ─── Test 9: Third-party download site penalty ──────────────────────────

{
  const downloadSite = makeResult({
    title: '微信高速下载',
    domain: 'downcc.com',
    displayUrl: 'downcc.com',
    detectedType: 'third_party_download_site',
  });
  const scored = scoreResult(downloadSite, {
    query: '微信下载',
    intent: 'download',
    userPreferences: {},
  });

  assert.ok(scored.reasons.some(r => r.code === 'third_party_download'), 'third-party warning reason is present');
  assert.ok(scored.score < 60, `third-party download site should not be high confidence, got ${scored.score}`);

  console.log(`  Test 9 OK — third-party download score: ${scored.score}`);
}

// ─── Test 10: User "demote" preference lowers score ────────────────────

{
  const result = makeResult({ domain: 'neutral.example.com', displayUrl: 'neutral.example.com' });
  const neutral = scoreResult(result, { query: 'test', intent: 'general', userPreferences: {} });
  const demoted = scoreResult(result, {
    query: 'test',
    intent: 'general',
    userPreferences: { 'neutral.example.com': 'demote' },
  });

  assert.ok(demoted.score < neutral.score, `demoted score ${demoted.score} < neutral score ${neutral.score}`);
  assert.ok(demoted.reasons.some(r => r.code === 'user_demoted'), 'reason includes user_demoted');

  console.log(`  Test 10 OK — neutral: ${neutral.score}, demoted: ${demoted.score}`);
}

// ─── Test 11: Preference priority in recommendations ────────────────────

{
  const results = [
    makeResult({ id: 'promote', title: 'Promoted source', domain: 'promote.example.com', originalRank: 3 }),
    makeResult({ id: 'demote', title: 'Demoted source', domain: 'demote.example.com', originalRank: 1 }),
    makeResult({ id: 'hide', title: 'Hidden source', domain: 'hide.example.com', originalRank: 2 }),
  ];
  const recs = getRecommendations({
    query: 'test',
    results,
    domainPreferences: {
      'promote.example.com': 'promote',
      'demote.example.com': 'demote',
      'hide.example.com': 'hide',
    },
  });

  assert.equal(recs.all.some(result => result.domain === 'hide.example.com'), false, 'hide excludes the result');
  assert.equal(recs.all[0].domain, 'promote.example.com', 'promote ranks above demote for equivalent sources');
  assert.equal(recs.hasHiddenResults, true, 'hidden result is reported');

  console.log('  Test 11 OK — hide excluded; promote ranked above demote');
}

// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== M3.1 Scoring Engine tests passed ===');
