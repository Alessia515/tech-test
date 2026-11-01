# Verification — Steps 3–4

Status: browser/data loading, restricted SELECT validation and worker timeout/recovery verified. Model generation, retrieval comparison, UI SQL editing, and clean-clone timing are still pending.

## Actual run

1 November 2026, Windows, headless Microsoft Edge via Playwright; DuckDB-WASM v1.5.4. Latest load/download/materialization/restriction setup: **2,834 ms**. This is a local measurement, not a cold-network benchmark or memory measurement.

Commands: `pnpm inspect:data`, `pnpm reference:data`, `pnpm test:validator`, `pnpm test:spike`, `pnpm build`. TypeScript checking and production bundling passed. Browser output is in data/browser-spike.json; the reviewed security fixtures are in tests/sql-cases.json.

```text
Computed 10 expected answers using JavaScript aggregation of 2964606 January rows.
Native/browser schema match: PASS
Native/browser summary match: PASS
Runtime external read and configuration lock probes: PASS
Only expected signed Parquet startup extension request: PASS
All 10 reference SQL results match independent JavaScript calculation: PASS
Uncaught browser errors: 0
Validator/query-runner tests: 82 passed, 0 failed
Browser attack cases: 50/50 blocked
Browser accepted cases: 15/15 preserve original results after compilation
Browser result cap: 500 rows, truncated=true
Real worker timeout: configured 5 ms, observed 7 ms
Timed-out session: rejects subsequent query; reload returns 2964624 rows
Browser harness: 10 assertions passed
```

| Reference query | Pass | Result rows |
| --- | --- | --- |
| January trip count | yes | 1 |
| Daily counts | yes | 31 |
| Average distance | yes | 1 |
| Total metered fare | yes | 1 |
| Card trip count | yes | 1 |
| Card tip percentage | yes | 1 |
| Top pickup IDs | yes | 5 |
| Hourly counts | yes | 24 |
| Average fare over 10 miles | yes | 1 |
| Contradictory date filter | yes | 0 |

These are hand-authored reference queries, **not LLM-generated queries**. Native DuckDB reads raw columns for the JavaScript calculation; the browser independently parses, validates, reconstructs and executes the reference SQL. Shared data decoding and human review of metric definitions remain limits of this oracle. Raw count: 2,964,624; January count: 2,964,606; January card trips: 2,319,036. This catches the otherwise silent error of treating every file row as a January pickup.

## Runtime restriction probes so far

`SELECT * FROM read_parquet('https://example.com/probe.parquet')` fails with "file system operations are disabled by configuration". `SET enable_external_access = true` fails with "the configuration has been locked". These two fixed probes bypass the validator deliberately to test defense in depth. All other untrusted queries must use the runner. The network log contains only signed Parquet extension requests during the three initializations, with no request to the probe URL.

## SELECT validation and attacks

We use the pinned PostgreSQL grammar of node-sql-parser, **not a complete DuckDB parser**. The validator accepts only a small reviewed AST subset, checks table/column/function names, and constructs a new SQL string from approved nodes and escaped literals. The raw input is never sent to DuckDB on the untrusted execution path. This reduces dialect-differential risk: even if the parser misinterprets some input, the emitted query can only use our limited SELECT grammar. SQL meaning can still change, so accepted fixtures compare actual browser results before/after reconstruction, including a string containing doubled apostrophes and SQL-looking text. The forthcoming UI must display executable SQL as well as the editable proposal.

| Attack group | Examples actually tested | Outcome |
| --- | --- | --- |
| Mutation and command statements | DROP, mixed-case/comment-prefixed DROP, DELETE, UPDATE, CREATE, SET, PRAGMA, INSTALL, LOAD | blocked |
| Stacked statements | SELECT; DROP, SELECT; SELECT, comments before COPY | blocked |
| CTEs and nested queries | read-only CTE, DELETE RETURNING CTE, recursive CTE, scalar/derived subqueries | blocked; all CTEs/subqueries out of scope |
| Alternative table access | read_parquet URL, read_csv path, glob, quoted URL, duckdb_tables, information_schema, main.trips | blocked |
| Scalar side effects/dynamic SQL | read_blob, query, query_table, getenv, nextval, setseed, write_log; quoted and schema-qualified functions | blocked |
| Export/attachment | ATTACH, COPY TO path, COPY query TO URL, SELECT INTO | blocked |
| Unsupported/expensive shapes | joins, UNION, window function, range, repeat, unknown column/qualifier, BLOB cast, FILTER, CASE, OFFSET, oversized LIMIT | blocked |
| Benign SQL-looking text | comments, case changes, semicolon/DROP/URL inside string literals | accepted; browser result semantics preserved |

The Node suite also proves that rejected inputs cause **zero execution-driver calls**, unknown schema names fail, SQL round-trips stably, oversized/deep input fails, overlapping requests are rejected, ordinary query errors leave the session usable, explicit close cancels pending work, and timeouts invalidate the session.

The browser suite sends all ten golden queries through the validator and real runner. A 501-row outer cap detects truncation; only 500 rows are returned to the UI layer. Normal query budget is ten seconds. The timeout test uses a five-millisecond budget on a distinct-timestamp aggregation to exercise the real termination path quickly. It kills the worker, rejects reuse, and reloads a fresh database with the correct raw row count. This does not benchmark worst-case termination on every device, and browser background-tab throttling can delay timers.

## Demonstrated limitations and pending risks

1. **Offline startup fails without the Parquet extension.** Engine files are local, but the pinned WASM package loads Parquet support from DuckDB's signed-extension CDN during initialization. A future improvement is to vendor/checksum that extension for each supported WASM variant.
2. **The entire table is materialized.** Download is ~50 MB plus a ~36–41 MB uncompressed engine variant; materializing all columns consumes additional memory. Low-memory/mobile performance is unmeasured, and later queries do not gain Parquet column pruning. The source file registration is dropped after materialization.
3. **Timestamp anomalies change answers.** Eighteen file rows fall outside January, with the earliest pickup in 2002. We preserve them and explicitly scope January metrics; a generated query omitting that range will be semantically wrong even when it executes.
4. **Supported SQL is intentionally limited.** Valid DuckDB CTEs, joins, subqueries, window functions, CASE/FILTER, intervals, and custom functions/types are rejected. Use WHERE filters, simple date constants, and approved aggregates. No bypass in the tested subset is known; this is not a formal proof or a sandbox against someone who controls the browser's developer tools.
5. **Memory use is not strictly bounded.** The row cap limits transfer/rendering, not intermediate grouping/sorting memory. Timeout/worker termination bounds ordinary execution duration, but memory exhaustion can occur first. Complex parser work occurs on the UI thread, bounded by input length/AST checks rather than a separately timed parsing worker.
6. **Safety does not establish semantic correctness.** A safe query can omit January filtering or confuse fare and total_amount. Golden answers are established, but no generated queries have been evaluated yet. Exact semantics for arbitrary large numeric literals or unsupported escape syntax are outside the tested subset.
7. **Bundle growth is measured.** Adding the PostgreSQL parser brings the current main JS chunk to ~752 kB minified (~186 kB gzip), triggering Vite's chunk-size warning. Code splitting is deferred until the working loop and verification are solid; this warning does not fail the production build.

Retrieval ablation, live golden generation, malicious prompt tests, edited-SQL UI checks, and clean setup rehearsal will be added as those steps are completed. The attack suite should grow when new supported syntax or actual bypasses are found.
