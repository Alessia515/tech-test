import golden from '../data/golden.json';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableRows } from './database';

type QueryTable = Awaited<ReturnType<AsyncDuckDBConnection['query']>>;
export async function verifyReferenceQueries(run: (sql: string) => Promise<{ table: QueryTable }>) {
  const results = [];
  for (const item of golden) {
    const actual = tableRows((await run(item.sql)).table);
    const expected = item.expected as Record<string, unknown>[];
    const tolerance = item.tolerance ?? 0;
    const passed = actual.length === expected.length && actual.every((row, index) => {
      const want = expected[index];
      return Object.keys(row).length === Object.keys(want).length && Object.entries(want).every(([key, value]) =>
        typeof value === 'number'
          ? typeof row[key] === 'number' && Math.abs((row[key] as number) - value) <= tolerance
          : row[key] === value);
    });
    results.push({ id: item.id, passed, rows: actual.length, actual });
  }
  return results;
}
