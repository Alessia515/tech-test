import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ channel, headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5173') && !request.url().startsWith('blob:')) external.push(request.url());
  });
  await page.goto('http://127.0.0.1:5173/verify.html');
  await page.getByRole('button', { name: 'Run data spike' }).click();
  await page.getByTestId('report').waitFor({ timeout: 90000 });
  const report = JSON.parse(await page.getByTestId('report').innerText());
  const reference = JSON.parse(await readFile('data/inspection.json', 'utf8'));
  assert.deepEqual(report.summary, reference.summary, 'WASM results match native inspection');
  assert.deepEqual(report.schema, reference.schema, 'WASM schema matches native inspection');
  assert.ok(report.guards.every(guard => guard.blocked), 'external reads and configuration changes are blocked');
  assert.ok(external.length <= 3 && external.every(url => /^https:\/\/extensions\.duckdb\.org\/v1\.5\.4\/wasm_(eh|mvp)\/parquet\.duckdb_extension\.wasm$/.test(url)), 'only signed Parquet extension requests occur during the three trusted initializations');
  assert.ok(report.referenceQueries.length === 10 && report.referenceQueries.every(item => item.passed), 'all 10 reference queries match independently calculated answers');
  assert.equal(errors.length, 0, 'no uncaught page errors');
  assert.ok(report.validator.attacks.length === 50 && report.validator.attacks.every(item => item.blocked), 'all 50 attacks are blocked by validation');
  assert.ok(report.validator.compatible.length === 15 && report.validator.compatible.every(item => item.passed), 'all 15 accepted cases preserve browser query results');
  assert.deepEqual(report.validator.resultCap, { rows: 500, truncated: true });
  assert.equal(report.timeoutRecovery.reloadedRows, '2964624', 'actual worker timeout and reload succeed');
  await writeFile('data/browser-spike.json', JSON.stringify({ ...report, external, errors, assertions: '10 passed' }, null, 2) + '\n');
  console.log(JSON.stringify({ loadMs: report.loadMs, version: report.version, summary: report.summary, referenceQueries: report.referenceQueries.map(({id,passed,rows}) => ({id,passed,rows})), attacksBlocked: report.validator.attacks.filter(item => item.blocked).length, compatible: report.validator.compatible.filter(item => item.passed).length, resultCap: report.validator.resultCap, timeoutRecovery: report.timeoutRecovery, guards: report.guards, external, errors, assertions: '10 passed' }, null, 2));
} finally { await browser.close(); }



