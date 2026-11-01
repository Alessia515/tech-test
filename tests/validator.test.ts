import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSql, SqlValidationError, TRIP_COLUMNS } from '../src/sql-validator.ts';
import { createQueryRunner } from '../src/query-runner.ts';

const cases = JSON.parse(readFileSync(new URL('./sql-cases.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../data/golden.json', import.meta.url), 'utf8'));
const inspection = JSON.parse(readFileSync(new URL('../data/inspection.json', import.meta.url), 'utf8'));
for (const sql of cases.blocked) test(`blocks: ${sql}`, () => assert.throws(() => validateSql(sql), SqlValidationError));
for (const sql of [...cases.allowed, ...golden.map((item: {sql: string}) => item.sql)]) {
  test(`accepts and safely round-trips: ${sql}`, () => {
    const result = validateSql(sql);
    assert.equal(validateSql(result.sql).sql, result.sql);
    assert.match(result.executionSql, /LIMIT 501$/);
  });
}
test('schema allowlist matches the actual pinned file', () => {
  assert.deepEqual(TRIP_COLUMNS, inspection.schema.map((item: {column_name: string}) => item.column_name));
});
test('empty, oversized and deep expressions fail closed', () => {
  for (const sql of ['', null, 42, 'SELECT '.repeat(2000), `SELECT ${'abs('.repeat(30)}fare_amount${')'.repeat(30)} FROM trips`]) {
    assert.throws(() => validateSql(sql), SqlValidationError);
  }
});
test('rejected SQL never reaches the driver', async () => {
  let calls = 0;
  const runner = createQueryRunner(async () => { calls++; return new FakeTable(0); }, () => {});
  for (const sql of cases.blocked) await assert.rejects(runner.run(sql), SqlValidationError);
  assert.equal(calls, 0);
});
class FakeTable {
  numRows: number;
  constructor(rows: number) { this.numRows = rows; }
  slice(begin: number, end: number) { return new FakeTable(Math.min(this.numRows, end) - begin); }
}
test('runner executes canonical SQL, caps rows and rejects overlapping requests', async () => {
  let resolve!: (table: FakeTable) => void;
  let executed = '';
  const runner = createQueryRunner(sql => { executed = sql; return new Promise<FakeTable>(r => { resolve = r; }); }, () => {});
  const pending = runner.run('/* comment */ SELECT * FROM trips');
  await assert.rejects(runner.run('SELECT count(*) FROM trips'), /already running/);
  assert.equal(executed, validateSql('SELECT * FROM trips').executionSql);
  resolve(new FakeTable(501));
  const result = await pending;
  assert.equal(result.table.numRows, 500);
  assert.equal(result.truncated, true);
});
test('timeout terminates execution and permanently invalidates the session', async () => {
  let stopped = false;
  const runner = createQueryRunner(() => new Promise<FakeTable>(() => {}), () => { stopped = true; }, 10);
  await assert.rejects(runner.run('SELECT * FROM trips'), /time limit/);
  assert.equal(stopped, true);
  assert.equal(runner.closed, true);
  await assert.rejects(runner.run('SELECT * FROM trips'), /session ended/);
});
test('explicit close interrupts an active query and rejects future queries', async () => {
  let stops = 0;
  let executions = 0;
  const runner = createQueryRunner(() => { executions++; return new Promise<FakeTable>(() => {}); }, () => { stops++; });
  const pending = runner.run('SELECT * FROM trips');
  runner.close();
  await assert.rejects(pending, /session ended/);
  await assert.rejects(runner.run('SELECT * FROM trips'), /session ended/);
  runner.close();
  assert.equal(stops, 1);
  assert.equal(executions, 0);
});
test('ordinary execution errors leave the session reusable', async () => {
  let calls = 0;
  const runner = createQueryRunner(async () => {
    if (++calls === 1) throw new Error('Binder error');
    return new FakeTable(1);
  }, () => {});
  await assert.rejects(runner.run('SELECT fare_amount FROM trips'), /Binder error/);
  assert.equal((await runner.run('SELECT fare_amount FROM trips')).table.numRows, 1);
  assert.equal(runner.closed, false);
  runner.close();
});
