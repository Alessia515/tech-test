import { validateSql, RESULT_LIMIT } from './sql-validator.ts';

export const QUERY_TIMEOUT_MS = 10_000;
type ResultTable<T> = { numRows: number; slice(begin: number, end: number): T };

/** This is the only entry point for generated/edited SQL. Trusted setup is separate. */
export function createQueryRunner<T extends ResultTable<T>>(
  execute: (sql: string) => Promise<T>,
  terminate: () => void,
  timeoutMs = QUERY_TIMEOUT_MS,
) {
  let busy = false;
  let closed = false;
  let rejectActive: ((error: Error) => void) | undefined;
  function close(message = 'Database session ended. Reload the dataset to continue.') {
    if (closed) return;
    closed = true;
    terminate();
    rejectActive?.(new Error(message));
  }
  return {
    get closed() { return closed; },
    close,
    async run(sql: unknown) {
      if (closed) throw new Error('Database session ended. Reload the dataset to continue.');
      if (busy) throw new Error('A query is already running. Wait for it to finish.');
      const validated = validateSql(sql); // No driver call occurs before validation.
      busy = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const interrupted = new Promise<never>((_resolve, reject) => {
          rejectActive = reject;
          timer = setTimeout(() => {
            // Kill the actual worker, not just the waiting Promise.
            close('Query exceeded its time limit. The database was stopped; reload the dataset.');
          }, timeoutMs);
        });
        const table = await Promise.race([Promise.resolve().then(() => {
          if (closed) throw new Error('Database session ended. Reload the dataset to continue.');
          return execute(validated.executionSql);
        }), interrupted]);
        return {
          ...validated,
          table: table.numRows > RESULT_LIMIT ? table.slice(0, RESULT_LIMIT) : table,
          truncated: table.numRows > RESULT_LIMIT,
        };
      } finally { if (timer !== undefined) clearTimeout(timer); rejectActive = undefined; busy = false; }
    },
  };
}
