import cases from '../tests/sql-cases.json';
import { SqlValidationError } from './sql-validator';
import { tableRows, loadDatabase } from './database';
type Session = Awaited<ReturnType<typeof loadDatabase>>;

export async function verifyValidator({ connection, runner }: Session) {
  const attacks = [];
  for (const sql of cases.blocked) {
    try { await runner.run(sql); attacks.push({ sql, blocked: false, error: '' }); }
    catch (error) { attacks.push({ sql, blocked: error instanceof SqlValidationError, error: String(error) }); }
  }
  const compatible = [];
  for (const sql of cases.allowed) {
    // Both inputs here are fixed, reviewed fixtures. Raw SQL is never used for user input.
    const original = tableRows(await connection.query(sql));
    const result = await runner.run(sql);
    const compiled = tableRows(result.table);
    const passed = JSON.stringify(original) === JSON.stringify(compiled);
    compatible.push({ sql, passed, executableSql: result.executionSql });
    if (sql.includes("it''s") && compiled[0]?.text !== "it's a SELECT; DROP TABLE trips") {
      throw new Error('Quoted string semantics changed during validation.');
    }
  }
  const limited = await runner.run('SELECT * FROM trips');
  return { attacks, compatible, resultCap: { rows: limited.table.numRows, truncated: limited.truncated } };
}

export async function verifyTimeoutRecovery(status: (message: string) => void) {
  status('Testing actual worker timeout…');
  const session = await loadDatabase(status, 5);
  let timeoutMessage = '', closedMessage = '';
  const started = performance.now();
  try {
    try { await session.runner.run('SELECT count(DISTINCT CAST(tpep_pickup_datetime AS VARCHAR)) AS n FROM trips'); }
    catch (error) { timeoutMessage = String(error); }
    try { await session.runner.run('SELECT count(*) FROM trips'); }
    catch (error) { closedMessage = String(error); }
  } finally { await session.close(); }
  const elapsedMs = Math.round(performance.now() - started);
  if (!timeoutMessage.includes('time limit') || !closedMessage.includes('session ended')) {
    throw new Error(`Worker timeout/rejection failed: ${timeoutMessage}; ${closedMessage}`);
  }
  status('Reloading the dataset after timeout…');
  const recovered = await loadDatabase(status);
  try {
    const count = tableRows((await recovered.runner.run('SELECT count(*) AS n FROM trips')).table);
    if (count[0]?.n !== '2964624') throw new Error('Dataset reload after timeout failed.');
    return { timeoutMessage, closedMessage, elapsedMs, reloadedRows: count[0].n };
  } finally { await recovered.close(); }
}
