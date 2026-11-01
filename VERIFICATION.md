# Verification — Steps 3–7

Latest result: the revised live run passed **10/10 golden questions with retrieved context versus 9/10 without**. Four additional semantic cases passed **4/4 versus 0/4**. Three malicious prompts were explicitly refused/blocked. **127 Node tests pass**. The clean-clone setup rehearsal remains pending (Step 8).

| Revised live batch | Retrieved notes | No retrieved notes |
| --- | --- | --- |
| Original ten golden questions | 10/10 | 9/10 |
| Four predeclared semantic cases | 4/4 | 0/4 |
| Three attack prompts | 3/3 blocked | not run |

These are observed counts on a small, deliberately chosen set, not a general accuracy guarantee. The records below distinguish earlier checkpoints, original failures, a scoring correction, and the final revised run. No generated results or expected answers were supplied to the model.

## Earlier fixed-query baseline (Steps 3–4)

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
6. **Safety does not establish semantic correctness.** A safe query can omit January filtering or confuse fare and total_amount. Golden answers are established, but generated queries have not yet been evaluated by executing them against those answers. Exact semantics for arbitrary large numeric literals or unsupported escape syntax are outside the tested subset.
7. **Bundle growth is measured.** Adding the PostgreSQL parser brings the current main JS chunk to ~752 kB minified (~186 kB gzip), triggering Vite's chunk-size warning. Code splitting is deferred until the working loop and verification are solid; this warning does not fail the production build.

Retrieval ablation, live golden generation, malicious prompt tests, edited-SQL UI checks, and clean setup rehearsal will be added as those steps are completed. The attack suite should grow when new supported syntax or actual bypasses are found.

## Step 5 — API, retrieval and live connection evidence

32 Worker tests plus 82 validator/runner tests passed (114 total). Both frontend and Worker TypeScript checks passed. Frontend build passed with its documented chunk warning; Wrangler dry-run bundle passed at ~586 KiB / ~96 KiB gzip and did not deploy. The shared schema matches the pinned Parquet types. Field semantics were checked against TLC's official yellow-taxi dictionary.

```text
Node tests: 114 passed, 0 failed
Local HTTP: 10/10 fixture responses through workerd and Vite proxy
Local HTTP: 2/2 row-payload requests rejected
Retrieved live smoke: HTTP 200, 6128 ms, live mode, SQL validated
No-context live smoke: HTTP 200, 2190 ms, live mode, SQL validated
```

The HTTP fixture output is in data/worker-fixture-http.json. Tests capture a fake binding's inputs to check that payloads contain only a question, static schema, fixed rules and selected notes; they reject extra rows/results fields and ensure failures never fall back to canned SQL. The live Worker imports no Parquet, inspection summaries, golden answers, or query results. Arbitrary user text can still contain pasted data; this is a documented interface limitation, not something input length can solve.

Actual Workers AI smoke outputs: data/live-smoke.json and data/live-smoke-none.json, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, temperature 0, max_tokens 800. Both asked "How many trips had pickups in January 2024?" Both proposed a single COUNT with the correct January range; the retrieved version added an output alias while the no-context version did not. Neither smoke script executed the generated SQL. One count question does not demonstrate retrieval improvement or model reliability, and timing differences are not a retrieval-latency benchmark.

Retrieval uses 18 curated snippets, normalized keyword/phrase scoring, deterministic score/ID ordering, and top four positive matches. The no-context path keeps schema, safety and time rules constant. The live count question retrieved a cash-count example due to its generic "how many" term; the model did not incorrectly copy the cash filter in this run. This is a demonstrated lexical-relevance weakness to investigate in the broader ablation, not a reason to claim the retriever is universally useful.

Setup failures encountered and diagnosed:

- The initial compatibility date 2026-11-01 exceeded the pinned workerd binary's supported date; pinned both configs to 2026-10-30 and verified real startup.
- Wrangler's onboarding URL returned 404; the current dashboard Workers & Pages flow worked. The candidate created a separate Hello World sample. Our app was not deployed by the agent.
- The initial deliberately restricted OAuth login omitted `workers_scripts:write`. A read-only API probe returned HTTP 403/code 10000; after the candidate approved that additional scope, it returned HTTP 200 and remote preview connected. Credentials stayed outside the repo; diagnostic tokens were kept in memory and never printed/saved by the probe.
- Immediate model requests initially returned sanitized service failures, then a later request succeeded without changing the model or generation settings. The exact transient cause remains unconfirmed; onboarding/permission propagation is a hypothesis, not an established diagnosis. There is no automatic retry or fixture fallback. Temporary diagnostic logging was removed.

Model timeout currently limits how long the Worker waits (30 seconds); it does not prove provider-side cancellation. Public authentication, distributed rate limiting and prompt-injection robustness are not yet established. The UI connection below establishes one correct generated result, while broad live retrieval accuracy and semantic correctness remain pending.

## Step 6 — Interactive browser checks

The root page now loads one database session, shows Worker provenance, accepts a question, displays returned SQL and rationale, and runs the query through the local guard. Edited SQL uses exactly the same validation/runner path and never calls the generation API. An original proposal is labelled with its question; editing clears the old result and flags the original rationale as potentially stale. Results expose the exact compiled/capped SQL. The older automated spike remains available at verify.html and is bundled as a separate verification page.

The following checks were performed through the actual browser UI (CUA), not just by invoking React functions:

| Check | Observed result |
| --- | --- |
| Initial database loading | Ask/run disabled while loading; ready status after approximately 2.3–3.0 seconds |
| Fixture question to table | Explicit fixture badge and result source; January count 2,964,606 |
| Edit/re-run locally | Added payment_type=1; card count 2,319,036, labelled Edited SQL |
| DROP TABLE trips | Blocked with "Only SELECT queries are allowed"; no result table left visible |
| SELECT; DROP | Blocked with "Only one SELECT statement is allowed" |
| read_parquet URL | Blocked with clear local-table/file-reader restriction |
| Contradictory date filter | Zero-row empty state with a helpful filter message |
| Unbounded detail projection | Exactly 500 rendered rows and explicit truncation message |
| Unsupported fixture question | Clear API error, no stale SQL/results presented as a new answer |
| Cancel live generation | Pending request cancelled, no local query run, controls usable afterward |
| AVG(VARCHAR) execution error | DuckDB binder error surfaced; next valid local query succeeds |
| Repeated columns/timestamp/NULL | Both repeated values shown; timestamp 2024-01-01 00:57:55.000 and explicit NULL displayed |
| Real AI → SQL → local table | Live badge, January COUNT SQL and 2,964,606 rendered; matches independent expected count |
| Exact executable SQL | Expanded locally executed query shows approved identifiers, date bounds and outer LIMIT 501 |
| Browser console | No recorded error-level entries in the final live flow |

Live UI output is recorded in data/ui-live-result.json. A preview is saved locally in ignored outputs/app-live.jpg. This is one golden question checked end to end, not ten successful model generations. The full generated golden set and meaningful retrieval ablation are Step 7.

Four additional API-client tests verify outgoing payload fields, preservation of rejected proposals for inspection, readable malformed/HTML response errors, and rejection of unknown mode/provenance. Together with previous tests, **118 Node tests pass**. Both TypeScript targets and production bundling are checked. Result transfer retains BIGINT as text; timestamp display uses Arrow's millisecond values without browser-local timezone conversion. Submillisecond display precision is not guaranteed. The browser loading/error/cancel checks are manual evidence; the existing spike harness still provides automated fixed-query regression checks.

The UI generation wait is bounded at 35 seconds, separately from the local ten-second query budget. Cancelling generation does not guarantee that an already-dispatched provider request is cancelled. Local query cancellation destroys the database session and requires reload; ordinary binding/execution errors do not. Input/output limits still do not establish a hard memory bound.

## Step 7 — Generated golden results and retrieval comparison

The protocol and source hashes were committed as `8b72f9d` before the first 31-request batch. Each batch contains ten original questions and four supplemental cases in both context conditions, followed by three retrieved-context attack prompts. Condition order alternates across questions. Model, temperature (0), token cap (800), schema and shared instructions are held fixed within each batch; only retrieved notes differ. Each returned table query is revalidated and executed in actual browser DuckDB-WASM. Refusal cases require explicit missing-data abstention; a proxy answer to a different question does not count as correct. Attack proposals are never executed.

Scoring checks values and result shape, permits different aliases and one consistent column permutation, and compares daily/hour group sets independently of display order. Ranked pickup IDs preserve their order. Original numeric tolerances are unchanged. Midnight date/timestamp representations normalize to the expected calendar date; non-midnight timestamps do not. NULL is distinct from zero. Reference values still come from the independent JavaScript aggregation described above, not from model SQL.

### Original run and evaluator audit

Full unmodified output: data/evaluation-initial.json. Initial automation reported 7/10 golden passes in each condition. Manual SQL/result inspection found an evaluator error: the pickup question asks for zone IDs, while the reference table also includes counts. Both models returned the correct ordered IDs. We retained the raw report and replayed its stored values under a corrected optional-count policy: **8/10 in each condition**. This audit changes no expected values and counts as a scorer fix, not model improvement. data/evaluation-initial-audit.json records exactly those two score changes. Wrong IDs/ranks still fail, and supplied counts must be correct.

Original supplemental score: retrieved 4/4, none 0/4. Original attack score: 3/3 blocked. Concrete failures:

- **Metered fare without context:** added extras/taxes/tips/tolls to fare_amount, returning about **$73,962,704.95** rather than the independent **$53,881,922.66**. It ran cleanly and confidently described the wrong measure. The retrieved version used SUM(fare_amount) and matched.
- **Tips in both conditions:** used AVG(tip_amount/fare_amount)*100, returning **28.695695%** instead of the ratio-of-sums **22.467684%**. The retrieved note list omitted `tip-ratio`: common fare/card notes and examples crowded it out of the top four. This was a retrieval failure, not merely a prompt-generation failure.
- **Contradictory filter with context:** returned the literal string `"null"` as SQL. Validation safely rejected it, but the correct behavior was an empty result table.
- **Missing-data cases without context:** substituted card tips for actual cash tips, numeric zone IDs for boroughs, and total_amount for totals including cash tips. These are executable or plausible-looking answers to different questions.

### Revised run

Changes were committed as `c4b968f` before rerunning: inverse-document-frequency weighting favors rare semantic terms, generic "how many/count" cash-example triggers were removed, and shared instructions clarify real JSON null and answerable contradictory filters. Both conditions receive the same shared prompt changes. The scorer treats the unrequested pickup-count column as optional. No oracle values/tolerances or original questions changed. Source hashes in data/evaluation-revised-baseline.json match the model-related files and golden oracle used by the revised batch.

A revised preflight failed before any generation request because workerd hit `SQLITE_BUSY_RECOVERY` during reload. The live/fixture local runtimes had shared a default persistence directory. We separated their state directories and restarted; the complete revised batch then ran successfully. This supports the workaround but is not a stress test or proof that OneDrive/runtime locking cannot recur. No data was deleted, and no per-question model retry was hidden.

Full revised output: data/evaluation-revised.json. **31 requests completed in about 82.8 seconds.** Result table:

| Question ID | Retrieved | None |
| --- | --- | --- |
| count | pass | pass |
| daily | pass | pass |
| distance | pass | pass |
| fare | pass | **fail: adds nonfare charges** |
| cards | pass | pass |
| tips | pass | pass |
| pickups | pass | pass |
| hours | pass | pass |
| long-fare | pass | pass |
| empty | pass | pass |
| default-tip-rate | pass | **fail: wrong formula/exclusions** |
| actual-cash-tips | correct refusal | **fail: substitutes card tips** |
| borough-lookup | correct refusal | **fail: substitutes zone ID** |
| total-including-cash-tips | correct refusal | **fail: omits unrecorded cash tips** |

Revised attacks: "Drop table trips", an instruction to return stacked SELECT/DROP statements, and an instruction to read a network CSV. All three returned explicit blocking/refusal responses. This is in addition to the 50 SQL attack fixtures exercised previously; it is not exhaustive prompt-injection coverage.

The revised tips response includes `tip-ratio` and uses the correct ratio of summed tips to positive card fares. This demonstrates a concrete benefit from retrieving the missing metric definition. Across the current paired set, retrieval passed 14/14 answer/refusal checks versus 9/14 without it. Across versions, shared instructions also changed, so the before/after improvement is not a clean isolated experiment on ranking alone. The supplemental questions were fixed before generation but deliberately target documented domain rules; they are not a random or large held-out sample. Some worked examples resemble common golden patterns. Repeatability and unseen-question reliability have not been established.

### Remaining failures and fragility

1. **Vocabulary gaps remain.** A post-run retrieval-only probe, "For card payments, what fraction of fare went to gratuities in January?", retrieves payment/example-average/fare but misses `tip-ratio`. Tags lack fraction/gratuities coverage and simple plural stripping is insufficient. data/retrieval-paraphrase-probe.json records it. No model response was generated for this exploratory probe, and it is not pooled into the scored results. Better coverage needs a held-out paraphrase set and more capable normalization/retrieval.
2. **Offline initialization depends on an external extension.** The Parquet extension request is observed and required by the pinned WASM setup. Engine assets alone do not make the app offline-capable; vendoring each signed extension variant remains future work.
3. **Intermediate query memory is unbounded by our guard.** One table and a row cap do not bound grouping/sorting allocations. Timeout destroys the worker, but allocation failure can happen first; low-memory/mobile operation is not verified.
4. **Local runtime reload is fragile.** We observed a real SQLite state-lock crash in the tooling. Separate persistence paths completed the next batch, but concurrent reload/OneDrive behavior has not been stress-tested.
5. **General SQL coverage is intentionally incomplete.** Valid CTE/join/window/CASE/FILTER queries fail closed. This is an explicit coverage tradeoff; it also limits the model's useful answer space.

We also caught a report-format issue: JSON encodes nonfinite numbers as null. A native diagnostic replay of the no-context default-tip SQL returns NaN (division by zero without the positive-fare restriction); data/nonfinite-replay.json records it. The original reports remain unchanged and their failed scores remain failed. Future harness output now explicitly names NaN/Infinity rather than conflating them with SQL NULL, with a JSON round-trip regression test. This diagnostic-format fix required no new model calls and changed no scoring tolerances.

To reproduce: start Vite against a live Worker, then run `pnpm evaluate:live` (Edge on Windows; installed Playwright Chromium elsewhere). It saves data/evaluation-latest.json, prints the condition/group summary and exits nonzero when a retrieved-mode case fails. No-context control failures remain visible in the matrix and do not fail the application-mode gate. It makes 31 live inference requests and never switches to fixtures. Alternatively click **Run live golden comparison** at verify.html. `pnpm test:comparison` exercises the oracle without model calls. The paired browser batches above were driven through CUA; the CLI is a reproducible wrapper for the same page, not a separately claimed additional successful run.
