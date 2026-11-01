# Talk to Your Data — implementation plan

Written before application code, 1 November 2026. Target: roughly five hours of active work; record pauses and actual work honestly. Work in explained steps with candidate review at each boundary.

## Scope and architecture

Build a single-page TypeScript/React/Vite app with a question input, editable SQL, short rationale, results table, and loading/error/empty states. Use DuckDB-WASM in a browser worker. A Cloudflare Worker receives a question, retrieves relevant curated dataset notes, and asks Workers AI for SQL and a short rationale. It never executes SQL or receives dataset rows or query results. Do not log question bodies or SQL by default. Users must avoid pasting data into their questions; the application cannot infer whether arbitrary question text contains a row.

Dataset: January 2024 NYC TLC yellow taxi Parquet, exposed as one `trips` table. It offers useful questions about time, distance, payments, and fares, and documented semantic traps. Confirm actual download size is within approximately 5–50 MB; if not, create and document a deterministic subset with its own checksum. Pin source URL, checksum, row count, schema, and preparation recipe. Serve the file locally to avoid depending on cross-origin remote reads. Use numeric taxi-zone IDs; human-readable boroughs require another dataset and are out of scope.

Prefer materializing the registered Parquet into an in-memory table during trusted initialization, then restricting external access before user SQL runs. This trades some memory and startup time for a smaller runtime query surface; measure it in the first spike. Parquet reduces download size, but materializing all columns does not retain its column-pruning benefit for later queries.

Use 15–20 curated notes covering column semantics, time scope, nulls, payment codes, and metric definitions. Retrieve a small top-k set by deterministic keyword scoring with explicit synonyms. Always include the fixed schema and essential safety/time rules. Return snippet IDs for inspection. No embeddings or Vectorize initially: a tiny corpus does not justify another provisioned service without evidence that lexical retrieval fails.

Proposed model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, configurable through the Worker. Its current model page documents Workers AI binding usage; verify actual availability with a smoke request. Workers AI needs Cloudflare access even when the Worker runs locally. Provide an explicitly labelled fixture mode for credential-free UI checks; it is not evidence of successful live generation. Never put credentials in browser code or Git.

Do not build charts, chat history, uploads, joins, correction learning, authentication, or multi-query planning. This is a local interview prototype; public deployment requires a separate access and abuse-control decision.

## Primary risks and early experiments

The main risk is accepting unsafe SQL while claiming SELECT is safe. Use a fail-closed parsed SQL subset, not a SELECT prefix or keyword blacklist. Spike parser compatibility with DuckDB syntax early. Allow one SELECT, known tables/columns, approved scalar/aggregate functions, and supported expressions only. Reject unknown syntax, file/URL table references, table functions, system catalogs, extension calls, stacked statements, and recursive queries. Permit ordinary CTEs only if every nested query is validated; otherwise reject them clearly and document the limitation. Apply the same guard to edited SQL immediately before browser execution. Worker-side checking is supplementary and cannot protect edited SQL.

Test DuckDB-WASM external-access and configuration-lock settings after trusted loading; native DuckDB documentation does not prove WASM behavior. Test a runtime query timeout by terminating/recreating the database worker if cancellation is unreliable. Bound displayed results, question length, and SQL length. A result cap alone does not bound query computation. If parser coverage or runtime restrictions fail, narrow the supported grammar and report the limitation rather than silently passing unsupported syntax.

Secondary risks: WASM asset/worker bundling, browser memory, model credentials, and semantic ambiguity. First prove local dataset loading, a correct aggregation, and a malicious external-read rejection. Check model access before spending time polishing the UI.

## How we will verify

Define ten golden questions before prompt tuning: trip count, daily counts, average distance, total fare, card-trip count, card-only tip percentage, top pickup IDs, hourly counts, a filtered aggregate, and an empty-result case. Fix metric definitions and month boundaries explicitly. Compute expected answers independently using a separately reviewed reference calculation; cross-check representative totals with a second calculation. Compare result values, ordering where meaningful, null behavior, and numeric tolerances rather than SQL text. Test generation failures as failures, without silent retries or changing expected answers.

Run identical questions with the same model/settings with and without retrieved notes. Record retrieved IDs, generated SQL, correctness, and failures for both. Keep schema and essential rules fixed. Expect gains particularly for cash tips and fare-versus-total semantics; report measured results even if retrieval provides no gain. Reserve a few paraphrases from prompt examples to reduce circular evaluation.

Attack stacked statements, comments and mixed case, quoted identifiers, nested CTEs, ATTACH, COPY TO, INSTALL/LOAD, read_parquet/read_csv URLs and paths, glob, system tables, and expensive queries. Check allowed queries too. Verify no rows/results appear in Worker request payloads. Run the golden suite in browser DuckDB-WASM, not just native DuckDB.

Finish with a fresh-checkout setup rehearsal, including download time and credentials. Target under ten minutes with documented prerequisites. Paste actual test output into VERIFICATION.md; include at least three observed failures or demonstrated limitations with diagnoses. AI-USAGE.md records real delegation, rejected suggestions, and a concrete error only when one occurs.

## Budget, assumptions, and changes

Budget: 30 minutes planning; 45 minutes browser/data spike and expected answers; 60 minutes validation; 60 minutes Worker/retrieval/UI; 60 minutes verification; 45 minutes setup/docs. At five active hours stop implementation and document remaining work. Candidate review pauses are recorded separately.

Assumptions: modern desktop browser, Node tooling, internet for initial downloads and model calls, and Cloudflare Workers AI access. Questions concern January pickups, not every timestamp present in the file; preserve source anomalies and document filtering. Tips recorded for card payments do not measure cash tips. Invalid/negative values are not silently cleaned; metric notes specify any exclusions. Model output and edited SQL are both untrusted. The supported SQL subset intentionally sacrifices coverage for inspectable validation.

Record deviations and their evidence in PROGRESS.md and summarize final decisions in VERIFICATION.md. Do not rewrite this initial plan to imply later discoveries were known beforehand.

## References checked during planning

- Dataset and dictionary: https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page
- WASM registration/import: https://duckdb.org/docs/current/clients/wasm/data_ingestion
- DuckDB security: https://duckdb.org/security
- Local bindings: https://developers.cloudflare.com/workers/local-development/bindings-per-env/
- Model: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
