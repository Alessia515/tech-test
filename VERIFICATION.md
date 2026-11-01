# Verification — Step 3 baseline

Status: browser/data spike verified. Model generation, retrieval comparison, SELECT validator attacks, UI SQL editing, runtime timeouts, and clean-clone timing are still pending.

## Actual run

1 November 2026, Windows, headless Microsoft Edge via Playwright; DuckDB-WASM v1.5.4. Load/download/materialization/restriction setup: **3,161 ms** in this run. This is a local measurement, not a cold-network benchmark or memory measurement.

Commands: `pnpm inspect:data`, `pnpm reference:data`, `pnpm test:spike`, `pnpm build`. TypeScript checking and production bundling passed. Browser output is in data/browser-spike.json.

```text
Computed 10 expected answers using JavaScript aggregation of 2964606 January rows.
Native/browser schema match: PASS
Native/browser summary match: PASS
Runtime external read and configuration lock probes: PASS
Only expected signed Parquet startup extension request: PASS
All 10 reference SQL results match independent JavaScript calculation: PASS
Uncaught browser errors: 0
Browser harness: 6 assertions passed
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

These are hand-authored reference queries, **not LLM-generated queries**. Native DuckDB reads raw columns for the JavaScript calculation; the browser independently executes the reference SQL. Shared data decoding and human review of metric definitions remain limits of this oracle. Raw count: 2,964,624; January count: 2,964,606; January card trips: 2,319,036. This catches the otherwise silent error of treating every file row as a January pickup.

## Runtime restriction probes so far

`SELECT * FROM read_parquet('https://example.com/probe.parquet')` fails with "file system operations are disabled by configuration". `SET enable_external_access = true` fails with "the configuration has been locked". The network log contains only `https://extensions.duckdb.org/v1.5.4/wasm_eh/parquet.duckdb_extension.wasm` during initialization, with no request to the probe URL. This is preliminary defense-in-depth evidence, not validation of a SELECT-only guard. DROP and the other planned attacks are untested so far.

## Demonstrated limitations and pending risks

1. **Offline startup fails without the Parquet extension.** Engine files are local, but the pinned WASM package loads Parquet support from DuckDB's signed-extension CDN during initialization. A future improvement is to vendor/checksum that extension for each supported WASM variant.
2. **The entire table is materialized.** Download is ~50 MB plus a ~36–41 MB uncompressed engine variant; materializing all columns consumes additional memory. Low-memory/mobile performance is unmeasured, and later queries do not gain Parquet column pruning. The source file registration is dropped after materialization.
3. **Timestamp anomalies change answers.** Eighteen file rows fall outside January, with the earliest pickup in 2002. We preserve them and explicitly scope January metrics; a generated query omitting that range will be semantically wrong even when it executes.
4. **No live SQL safety or model claim yet.** Runtime restrictions do not prevent destructive in-memory statements. The spike exposes only fixed trusted queries. User-edited SQL must wait for the validator.

Retrieval ablation, live golden generation, malicious prompt tests, full validator bypass tests, resource limits, and clean setup rehearsal will be added as those steps are completed.
