import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadDatabase, tableRows } from './database';
import './style.css';
import { verifyReferenceQueries } from './verify-reference';
import { verifyValidator, verifyTimeoutRecovery } from './verify-validator';

async function runSpike(status: (message: string) => void) {
  const session = await loadDatabase(status);
  const { connection, runner, loadMs, version } = session;
  try {
    const summary = tableRows(await connection.query(`SELECT count(*) AS raw_rows,
      count(*) FILTER (WHERE tpep_pickup_datetime >= TIMESTAMP '2024-01-01'
        AND tpep_pickup_datetime < TIMESTAMP '2024-02-01') AS january_rows,
      min(tpep_pickup_datetime)::VARCHAR AS earliest_pickup,
      max(tpep_pickup_datetime)::VARCHAR AS latest_pickup FROM trips`));
    const schema = tableRows(await connection.query('DESCRIBE trips'));
    const guards = [];
    for (const sql of [
      "SELECT * FROM read_parquet('https://example.com/probe.parquet')",
      'SET enable_external_access = true',
    ]) {
      try { await connection.query(sql); guards.push({ sql, blocked: false, error: '' }); }
      catch (error) { guards.push({ sql, blocked: true, error: String(error) }); }
    }
    const referenceQueries = await verifyReferenceQueries(sql => runner.run(sql));
    const validator = await verifyValidator(session);
    await session.close();
    const timeoutRecovery = await verifyTimeoutRecovery(status);
    return { version, loadMs, summary, schema, guards, referenceQueries, validator, timeoutRecovery };
  } finally { await session.close(); }
}

function App() {
  const [status, setStatus] = useState('Ready. This checks data loading and SQL validation, not AI generation.');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runSpike>> | null>(null);
  async function run() {
    setBusy(true); setResult(null);
    try { const report = await runSpike(setStatus); setResult(report); setStatus('Spike complete.'); }
    catch (error) { setStatus(`Failed: ${String(error)}`); }
    finally { setBusy(false); }
  }
  return <main><p className="eyebrow">INTERVIEW BUILD · STEP 4</p><h1>Talk to Your Data</h1>
    <p>Load January 2024 NYC yellow taxi trips locally and check the query engine.</p>
    <button onClick={run} disabled={busy}>{busy ? 'Checking…' : 'Run data spike'}</button>
    <p role="status">{status}</p>
    {result && <><h2>Loading and query report</h2><pre data-testid="report">{JSON.stringify(result, null, 2)}</pre></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
