import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { extractResults } from '../src/adapters/baidu/result-extractor';

const html = readFileSync('tests/fixtures/baidu-m2.3.html', 'utf8');
const { document, HTMLElement } = parseHTML(html);

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  value: () => ({ width: 640, height: 120 }),
});

globalThis.getComputedStyle = ((() => ({
  display: 'block',
  visibility: 'visible',
  opacity: '1',
})) as unknown) as typeof getComputedStyle;

const results = extractResults(document);

assert.deepEqual(
  results.map(result => result.originalRank),
  [1, 2, 4, 5, 6],
  'dedup keeps first duplicate title without renumbering originalRank',
);

const promoted = results.find(result => result.title === 'Promoted Download');
assert.equal(promoted?.isAdOrPromoted, true, 'promoted result is detected from M2 ad signals');
assert.equal(promoted?.domain, 'ads.example.com');

const real = results.find(result => result.title === 'Real Product');
assert.equal(real?.url, 'https://www.real.example/product');
assert.equal(real?.domain, 'real.example');

const dataTools = results.find(result => result.title === 'Data Tools Target');
assert.equal(dataTools?.url, 'https://tools.example.org/from-data');
assert.equal(dataTools?.domain, 'tools.example.org');

const unresolved = results.find(result => result.title === 'Opaque Redirect');
assert.equal(unresolved?.url, '', 'unresolved redirects do not expose baidu.com as target URL');
assert.equal(unresolved?.resolvedUrl, undefined);
assert.equal(unresolved?.domain, 'unknown');
assert.equal(unresolved?.displayUrl, 'unknown');

const display = results.find(result => result.title === 'Display Url Target');
assert.equal(display?.url, 'https://display.example.net/path');
assert.equal(display?.domain, 'display.example.net');

for (const result of results) {
  const fields = [result.url, result.resolvedUrl, result.domain, result.displayUrl].filter(Boolean);
  assert.equal(fields.some(field => field?.toLowerCase().startsWith('javascript:')), false);
  if (result.title === 'Opaque Redirect') {
    assert.equal(fields.some(field => field === 'www.baidu.com' || field === 'baidu.com'), false);
  }
}

console.log(`M2.3 verification passed: ${results.length} results`);
