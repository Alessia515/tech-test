import * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { createQueryRunner, QUERY_TIMEOUT_MS } from './query-runner';

// Engine assets are local. Parquet's signed extension loads from DuckDB's CDN
// during trusted initialization. The async API runs DuckDB off the UI thread.
export async function loadDatabase(onStatus: (message: string) => void, timeoutMs = QUERY_TIMEOUT_MS) {
  const started = performance.now();
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  });
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    onStatus('Starting DuckDB-WASM…');
    await db.instantiate(bundle.mainModule);
    const connection = await db.connect();
    onStatus('Downloading local Parquet file…');
    const response = await fetch('/data/trips.parquet');
    if (!response.ok) throw new Error('Dataset missing. Run pnpm data first.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    await db.registerFileBuffer('trips.parquet', bytes);
    onStatus('Loading trips into memory…');
    await connection.query("CREATE TABLE trips AS SELECT * FROM read_parquet('trips.parquet')");
    await db.dropFile('trips.parquet');
    // Trusted setup finishes before any user SQL will be allowed.
    await connection.query('SET enable_external_access = false');
    await connection.query('SET lock_configuration = true');
    const runner = createQueryRunner(sql => connection.query(sql), () => { void db.terminate(); }, timeoutMs);
    let disposed = false;
    return {
      db, connection, runner, loadMs: Math.round(performance.now() - started), version: await db.getVersion(),
      async close() {
        if (disposed) return;
        disposed = true;
        runner.close();
      },
    };
  } catch (error) {
    await db.terminate();
    throw error;
  }
}

export function tableRows(table: Awaited<ReturnType<duckdb.AsyncDuckDBConnection['query']>>) {
  return table.toArray().map(row => JSON.parse(JSON.stringify(row.toJSON(), (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value)) as Record<string, unknown>);
}
