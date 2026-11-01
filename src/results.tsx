import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
type QueryTable = Awaited<ReturnType<AsyncDuckDBConnection["query"]>>;
export type DisplayResult = {
  columns: string[];
  rows: string[][];
  truncated: boolean;
  elapsedMs: number;
  executableSql: string;
  source: "live" | "fixture" | "edited";
  question: string;
};
function cellText(value: unknown, type: string): string {
  if (value == null) return "NULL";
  if (
    (type.startsWith("Timestamp") || type.startsWith("Date")) &&
    typeof value === "number"
  ) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf()))
      return type.startsWith("Date")
        ? date.toISOString().slice(0, 10)
        : date.toISOString().replace("T", " ").replace("Z", "");
  }
  if (typeof value === "object")
    return JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  return String(value);
}
export function displayTable(table: QueryTable) {
  // Index access preserves duplicate output labels rather than overwriting their cells.
  const columns = table.schema.fields.map((field) => field.name);
  const vectors = columns.map((_name, index) => table.getChildAt(index));
  const rows = Array.from({ length: table.numRows }, (_unused, row) =>
    vectors.map((vector, col) =>
      cellText(vector?.get(row), table.schema.fields[col].type.toString()),
    ),
  );
  return { columns, rows };
}
export function Results({ result }: { result: DisplayResult }) {
  return (
    <section className="panel results" aria-labelledby="results-heading">
      <div className="section-heading">
        <h2 id="results-heading">Results</h2>
        <span className="badge">
          {result.source === "edited"
            ? "Edited SQL"
            : result.source === "fixture"
              ? "Fixture query"
              : "Live AI query"}
        </span>
      </div>
      <p className="muted result-question">{result.question}</p>
      <p role="status">
        {result.rows.length.toLocaleString()}{" "}
        {result.rows.length === 1 ? "row" : "rows"} ·{" "}
        {result.elapsedMs.toLocaleString()} ms
        {result.truncated
          ? " · First 500 rows shown; more rows were omitted."
          : ""}
      </p>
      {result.rows.length === 0 ? (
        <div className="empty" data-testid="empty-results">
          No rows matched this query. Try changing the filters.
        </div>
      ) : (
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Query results, scroll horizontally if needed"
        >
          <table>
            <thead>
              <tr>
                {result.columns.map((name, index) => (
                  <th key={index} scope="col">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, col) => (
                    <td
                      key={col}
                      className={cell === "NULL" ? "null-cell" : ""}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>SQL executed locally</summary>
        <pre>{result.executableSql}</pre>
      </details>
    </section>
  );
}
