/**
 * M2.3 Stability test — verifies that extractResults produces consistent
 * output when run repeatedly on the same HTML fixture, and that it correctly
 * excludes SearchLens panel nodes.
 */
import { parseHTML } from 'linkedom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIXTURE = resolve(process.cwd(), 'tests/fixtures/baidu-search-sample.html');
const ITERATIONS = 10;

function formatResult(r: any): string {
  return `[${r.originalRank}] "${r.title.substring(0, 30)}" domain=${r.domain} ad=${r.isAdOrPromoted} type=${r.detectedType}`;
}

// --- Bootstrap DOM ---
const html = readFileSync(FIXTURE, 'utf-8');
const { document: doc, window: win } = parseHTML(html);

// --- Mock browser APIs not provided by linkedom ---
(win as any).getComputedStyle = () => ({
  getPropertyValue: () => '',
  display: '',
  visibility: '',
  opacity: '1',
});

// Make all .c-container / .ec_result containers visible (linkedom returns 0-size rects)
const contentLeft = doc.getElementById('content_left');
if (contentLeft) {
  const containers = contentLeft.querySelectorAll('div.c-container, div.ec_result, div.ec_wise_ad, div.result-op');
  containers.forEach((el: any) => {
    el.getBoundingClientRect = () => ({
      x: 0, y: 0, bottom: 100, height: 100, left: 0, right: 800, top: 0, width: 800,
      toJSON() { return this; },
    });
  });
}

// --- Monkey-patch globalThis for the extractor ---
(globalThis as any).getComputedStyle = (win as any).getComputedStyle;

// --- Import extractor (will be bundled by esbuild) ---
import { extractResults } from '../src/adapters/baidu/result-extractor';

// ======================================================================
// Test 1: Determinism — N runs produce identical results
// ======================================================================
console.log(`\n=== Test 1: Determinism (${ITERATIONS} runs) ===`);

let previousResults: any[] | null = null;
let allMatch = true;

for (let i = 0; i < ITERATIONS; i++) {
  const results = extractResults(doc);

  if (previousResults === null) {
    previousResults = results;
    console.log(`  Run 0: ${results.length} results`);
    results.forEach(r => console.log(`    ${formatResult(r)}`));
  } else {
    const same = results.length === previousResults.length &&
      results.every((r, idx) =>
        r.originalRank === previousResults![idx].originalRank &&
        r.title === previousResults![idx].title &&
        r.domain === previousResults![idx].domain &&
        r.isAdOrPromoted === previousResults![idx].isAdOrPromoted &&
        r.detectedType === previousResults![idx].detectedType
      );
    if (!same) {
      console.log(`  Run ${i}: MISMATCH (${results.length} results vs ${previousResults.length})`);
      results.forEach(r => console.log(`    ${formatResult(r)}`));
      allMatch = false;
    }
  }
}

if (allMatch) {
  console.log('  ✅ All runs produced identical results');
} else {
  console.log('  ❌ Results differ between runs');
  process.exit(1);
}

// ======================================================================
// Test 2: Exclude SearchLens panel node
// ======================================================================
console.log('\n=== Test 2: Exclude SearchLens panel node ===');

// Insert a fake SearchLens panel inside #content_left
const panel = doc.createElement('div');
panel.id = 'searchlens-panel';
panel.className = 'searchlens-panel';
panel.innerHTML = '<div>SearchLens injected content</div>';
contentLeft?.insertBefore(panel, contentLeft.firstChild);

const resultsAfterPanel = extractResults(doc);
const panelInResults = resultsAfterPanel.some(r =>
  r.id === 'searchlens-panel' || r.title.includes('SearchLens')
);

if (panelInResults) {
  console.log('  ❌ SearchLens panel leaked into results!');
  resultsAfterPanel.forEach(r => console.log(`    ${formatResult(r)}`));
  process.exit(1);
} else {
  console.log(`  ✅ SearchLens panel excluded (${resultsAfterPanel.length} results, panel not among them)`);
}

// ======================================================================
// Test 3: Verify expected results from fixture
// ======================================================================
console.log('\n=== Test 3: Verify expected results from fixture ===');

const expectedTitles = [
  '微信电脑版下载_安全下载',           // rank 1, promoted
  '微信_百度百科',                     // rank 2, organic, baike.baidu.com
  '微信官网',                          // rank 3, organic, weixin.qq.com
  '微信安装教程',                      // rank 4, organic, blog.csdn.net
];

// Re-run without the panel node
contentLeft?.removeChild(panel);
const cleanResults = extractResults(doc);

let allExpectedFound = true;
for (const expected of expectedTitles) {
  const found = cleanResults.some(r => r.title === expected);
  if (!found) {
    console.log(`  ❌ Expected result not found: "${expected}"`);
    allExpectedFound = false;
  }
}

if (allExpectedFound) {
  console.log(`  ✅ All ${expectedTitles.length} expected titles found`);
} else {
  console.log('  ❌ Some expected titles missing');
  process.exit(1);
}

// ======================================================================
// Summary
// ======================================================================
console.log(`\n=== All tests passed ===`);
console.log(`Iterations: ${ITERATIONS}`);
console.log(`Results: ${cleanResults.length}`);
cleanResults.forEach(r => console.log(`  ${formatResult(r)}`));
