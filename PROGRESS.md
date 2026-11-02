# Interview build progress

## Working agreement

- Work in numbered steps. Explain the purpose and result of each step.
- Pause at each step boundary for the candidate to continue.
- Record decisions, verification evidence, deviations, and actual AI mistakes.
- Do not write application code before PLAN.md is committed as the first commit.
- The brief suggests roughly five hours. Record active work and pauses honestly; do not claim an unmeasured duration.

## Step 1 — Workspace and process

Status: complete.

- Inspected the supplied interview brief.
- Checked the workspace: it contains only work/ and outputs/; there is no Git repository or existing application.
- Checked for AGENTS.md instructions in the workspace and its relevant parent directories; none were found.
- Created this progress log outside the future application repository so planning can precede its first commit.
- No application code, dependencies, dataset, or Git commits have been created.

Why: preserve the required first-commit planning evidence and keep the candidate involved in every decision.

## Proposed next steps

2. Select dataset and stack, check current technical constraints, and write PLAN.md. Initialize a dedicated repository and commit only the plan first.
3. Prove browser DuckDB loading and querying; establish independent expected answers.
4. Build and attack SQL validation.
5. Add Worker retrieval and SQL generation, including a no-context comparison.
6. Connect the UI, editable SQL, and loading/error/empty states.
7. Run golden questions and security tests; investigate failures.
8. Verify clean setup, finish documentation, and rehearse the architecture and tradeoffs.

The sequence can change when evidence warrants it; record the reason here.

## Decisions pending

- Dataset, stack, model provider, and local credentials/setup strategy.
- Whether the candidate has already spent time against the suggested five-hour budget.

## Evidence and AI usage

- AI read and summarized the brief and performed workspace inspection.
- No implementation claims or test results yet.
- No concrete AI error identified yet; do not invent one for AI-USAGE.md.

## Step 2 — Planning (in progress)

- Moved the chat to the existing tech test project; its repository has no commits.
- Drafted PLAN.md before any application code. It will be the only file in the first commit.
- Chose TypeScript/React/Vite, browser DuckDB-WASM, Cloudflare Worker/Workers AI, and lexical retrieval over curated notes.
- Proposed January 2024 yellow taxi data; actual size/schema and model access remain to be verified.
- Checked official TLC, DuckDB, and Cloudflare documentation; references are in PLAN.md.
- Node v24.22.1 is available; npm is not on PATH; Python launcher is inaccessible. These are setup findings, not application failures.
- Git author identity is unset. Requested project-local author name/email before committing.
- Asked whether Workers AI access is available. No credentials requested in chat.
- No application code or tests yet. No measured active-time total yet.


### Step 2 completion

- Configured the candidate-provided Git author locally to this repository.
- Created root commit 14c9550 containing only PLAN.md; no application code precedes it.
- Git metadata writes required sandbox approval; approved operations completed successfully.
- Cloudflare/Workers AI access is unconfirmed; live generation verification remains pending.
- Step 2 is complete. Paused before Step 3 (browser/data feasibility spike).


## Step 3 — Browser/data feasibility (complete)

- Used bundled pnpm because npm is absent; pinned app/dev packages and committed a lockfile.
- Downloaded official January 2024 yellow taxi Parquet: 49,961,641 bytes; pinned SHA-256 in data/manifest.json. No sampling needed.
- Native inspection found 2,964,624 raw rows and 2,964,606 January rows; kept anomalies and defined explicit month filtering.
- Built a fixed-query React spike. Browser worker loads Parquet into memory, drops its registered source, disables external access and locks configuration.
- Independently aggregated ten expected answers in JavaScript from streamed raw columns, then ran reference SQL in browser WASM: all ten matched.
- Browser schema and summary match native inspection. External-read and configuration-unlock probes were blocked. No uncaught page errors.
- Latest verified browser initialization: 3,161 ms; no memory or cold-network benchmark claim.
- TypeScript and production build passed.
- Deviation/discovery: engine assets are bundled locally, but signed Parquet extension loads from DuckDB CDN during trusted initialization. Initial no-external-request assumption was wrong; the failing network check exposed it. Recorded in AI-USAGE.md and VERIFICATION.md.
- pnpm package-store links and headless Edge needed sandbox approvals. Nonessential Arrow CLI shim emitted a packaging warning; DuckDB imports, reference scripts and build succeeded.
- Added README commands, data provenance, actual verification evidence and explicit limitations. This step tests fixed reference SQL, not LLM generation or the pending SELECT validator.
- Candidate code walkthrough pending. Cloudflare access remains unconfirmed. Paused before Step 4.


## Step 4 — Restricted SELECT validation and attacks (complete)

- Chose pinned node-sql-parser PostgreSQL grammar; all ten reference queries parse. This is not a full DuckDB grammar.
- Added src/sql-validator.ts: explicit table/column/function allowlists, unknown-node rejection, and AST-to-SQL reconstruction. Raw untrusted SQL is never executed. CTEs/joins/subqueries/windows/CASE/FILTER intentionally rejected.
- Added src/query-runner.ts: validate immediately before driver calls, display cap 500 rows with truncation flag, default ten-second timeout, actual worker termination, rejected concurrent requests and closed-session reuse.
- Security fixtures cover 50 rejected cases and 15 allowed cases. Node suite has 82 passing tests, including no driver calls on rejection, canonical round-trips, cleanup, timeout, errors and schema agreement.
- Browser checks: all 50 rejected, all 15 allowed cases preserve results, all ten golden queries still match independent expected values through the validator, cap returns500/truncated=true.
- Actual browser worker timeout/reload test: five-millisecond test budget, seven milliseconds observed, old session rejected reuse, fresh session returned2,964,624 raw rows.
- Latest browser initial load2,834ms; no uncaught page errors; only expected signed Parquet startup extension requests.
- Compiler tests caught and fixed parser details: doubled apostrophes preserved in AST, NOT represented as a function, undefined tail metadata on chained casts. Recorded the literal-semantic error in AI-USAGE.md.
- TypeScript and production build passed. Main JS chunk~752kB/~186kB gzip now triggers Vite size warning; documented rather than suppressed.
- Remaining limits include incomplete SQL coverage, unbounded intermediate memory, timer throttling, and no assurance of semantic correctness for model output. UI editing and live model verification remain future steps.
- Step4 started around20:44:52 local; checkpoint time below. Wall time includes tool/approval waits and is not claimed as measured active effort.
- Paused before Step5: Worker retrieval and generation. Cloudflare access still unconfirmed.


Step 4 checkpoint recorded: 1 November 2026, approximately 20:54 Europe/Bucharest.


## Step 5 — Worker retrieval and generation (complete)

- Added an actual Cloudflare Worker with strict request/output contracts, health/provenance, clear refusals/errors, and server SQL validation. Browser-side validation remains mandatory for edited SQL.
- Shared a schema-only module between validator and prompt. The Worker imports no dataset rows, golden answers, or observed aggregate inspection values.
- Added18 curated snippets checked against TLC field documentation and deterministic top-four lexical retrieval. The no-context path retains fixed schema/time/safety rules.
- Added five explicitly canned fixture questions in a separate config with no AI binding; no silent fallback from live failures.
- Pinned Wrangler4.156.0 and exact allowed build scripts. Runtime startup caught unsupported current-date compatibility setting; corrected to2026-10-30, supported by the pinned binary.
- Restarted the verified local Vite process for its new API proxy. Ten fixture HTTP requests passed via Worker/proxy, and two row-payload requests were rejected.
- Candidate created/signed into Cloudflare Free and approved Wrangler OAuth. Wrangler onboarding link404 was resolved through current dashboard navigation; candidate deployed a separate Hello World sample. No interview app deployment by the agent.
- Initial login missed workers_scripts:write; read-only subdomain check returned403/code10000. Candidate approved the additional scope; same check then returned200 and preview connected. No credential values printed or committed.
- Initial model calls failed immediately; later calls succeeded without model/prompt-setting changes. Exact transient inference-failure cause remains unknown, not asserted as diagnosed.
- Real retrieved-context smoke:HTTP200 in6,128ms, correct January COUNT SQL validated. No-context smoke:HTTP200 in2,190ms, equivalent COUNT with an alias difference. Outputs saved separately; generated queries not yet executed by the smoke scripts.
- Retrieval weakness observed:generic how-many matching selected a cash-count example for an overall-count question. No wrong cash filter copied in this run. Broader retrieval-benefit evaluation is pending.
-32 Worker tests plus82 validator tests passed;114 total. Both TypeScript checks and frontend build passed. Worker dry-run bundle passed; no deployment.
- Updated setup instructions, verification and AI usage. All account/onboarding/approval waiting time is separate from any claimed active effort; active-time total remains unmeasured.
- Step5 started around20:56:34 Europe/Bucharest. Checkpoint follows. Paused before Step6:question input, editable SQL and results UI.


Step 5 checkpoint recorded: 1 November 2026, approximately 21:15 Europe/Bucharest.


## Step 6 — Question, SQL editor and results UI (complete)

- Added readable React modules for the app, API client, database lifecycle and results table. Pinned Prettier and formatted the new UI code for the candidate walkthrough.
- Root page now supports question → live/fixture Worker → visible SQL/rationale → local validation/execution → table. Every edited query goes through the same guarded runner without another model call.
- Live/fixture provenance is visible. Editing clears stale results and marks the old rationale as potentially stale; exact compiled/capped SQL is inspectable.
- Added initial loading/error/empty states, example questions, result truncation, generation cancellation, query cancellation and database reload. Generation wait35s and local query budget10s are separate.
- Moved the fixed-query spike to verify.html and updated its existing automated harness. Root UI is no longer a diagnostic report.
- Browser fixture count2,964,606 and edited card count2,319,036 matched independent references. DROP/stacked/file-reader edits blocked with readable messages. Empty and500-row truncated states verified.
- Browser live generation produced correct January COUNT and2,964,606 rows-as-count; result evidence saved in data/ui-live-result.json. This is one golden question, not full model evaluation.
- Cancelled a live generation and verified later queries still work. Actual AVG(VARCHAR) binder error surfaced; next local query recovered. Repeated columns, timestamps andNULL rendering checked.
- Added4 API-client tests for metadata-only outbound payloads and error/provenance handling;118 total Node tests passed. UI tests used actual CUA browser interactions. No final browser error-level logs observed.
- Switched the running Vite proxy to live Worker8788 using API_TARGET; normal documented setup still uses API8787. Fixture Worker remains available separately.
- Local preview saved in ignored outputs/app-live.jpg. Updated README, verification and AI usage. Candidate code walkthrough remains pending.
- Started around21:15:25 Europe/Bucharest; checkpoint time below. Durations are wall-clock observations, not a measured active-time total.
- Paused before Step7:full generated golden questions, retrieval comparison and failure analysis.


Step 6 checkpoint recorded: 1 November 2026, approximately 21:30 Europe/Bucharest. Both TypeScript targets and final production build passed; existing large-shared-chunk warning remains documented.


## Step 7 — Evaluation in progress

- Committed protocol8b72f9d before31 first-attempt live calls; original output preserved in data/evaluation-initial.json.
- Initial automated golden scores7/10 in both conditions. Audit found a scorer mistake:IDs-only ranking correctly answers the actual question, although the oracle also included counts. Replaying stored results with optional counts gives8/10 in both conditions; raw report preserved unchanged and audit saved separately.
- Initial semantic supplements:retrieved4/4 versus none0/4. Prompt attacks:3/3 blocked.
- Diagnosed actual wrong metered fare without context:extra charges inflated answer to73,962,704.95 instead of53,881,922.66.
- Diagnosed tips in both conditions:AVG(tip/fare) gave28.695695% instead of ratio-of-sums22.467684%. Critical tip-ratio note was omitted from retrieved top4 due common-word tie crowding.
- Retrieved empty-case output was textual null SQL, safely rejected rather than an empty table.
- Revised scoring only for genuinely optional counts; no expected data values/tolerances changed. Added regression checks for wrong ranks/counts.
- Revised retrieval with rare-term IDF weights and removed generic cash-example triggers. Clarified actual JSON null and answerable contradictory filters in shared instructions. Both context conditions get the same shared prompt changes.
- Second complete run will be preserved separately; no cherry-picked or silent model retries.


### Step 7 completion

- Revised complete batch saved in data/evaluation-revised.json:golden10/10 retrieved vs9/10 none; semantic supplements4/4 vs0/4; malicious prompts3/3 blocked.31 requests completed in82.8 seconds, with no automatic per-case retries.
- Both initial and revised outputs remain unchanged. Source hashes match revised Worker/model-related files and existing golden oracle. First-protocol8b72f9d and revisionsc4b968f provide pre-run history.
- Revised preflight failed before inference when workerd crashed with SQLITE_BUSY_RECOVERY. Isolated live/fixture persistence paths and restarted; complete run succeeded. Exact recurrence risk on concurrent/OneDrive reload remains unproven.
- Post-run exploratory retrieval-only paraphrase misses tip-ratio; saved separately and not pooled into scored results. Retained as a concrete lexical-coverage limitation.
- Diagnostic replay found no-context default-tip NaN serialized as null in JSON. Preserved original reports, saved native replay evidence, and made future report encoding distinguish nonfinite values from SQL NULL. Failed score unchanged; no new model calls for this check.
-127 Node tests pass after scorer/retrieval/report regression checks. Both TypeScript targets pass. Final bundle checks follow.
- Updated full pass/fail tables, semantic diagnoses, retained limitations and reproduction commands. No claim of general accuracy or isolated causal attribution across changed prompt versions.
- Began around21:31 Europe/Bucharest; checkpoint time below. Paused before Step8:clean-clone rehearsal, final concise docs, and candidate walkthrough.


Step 7 final checks:frontend production build and Worker dry-run bundle passed; no deployment. CLI exit status gates retrieved/application cases while retaining all no-context pass/fail results in its matrix. Checkpoint recorded1 November2026 around21:57 Europe/Bucharest.


## Step 8 — Reviewer rehearsal and handoff (complete)

- Added LF checkout rules and precise Node>=22.18 prerequisite, plus pnpm test/check convenience commands; committed9eae8d4 before cloning.
- Fresh local clone used an initially empty package-content store:113 packages downloaded,zero reused; dataset freshly downloaded and SHA-256 verified. Dependency install/data/127 tests completed in20.590s.
- Fixture result2,964,606 rendered324.097s after clone start (5m24s), including a sandbox networking timeout and host-server restart. Used isolated ports5174/8790 and matching origin/proxy settings. Node/pnpm/Edge were preinstalled; browser/CDN and registry metadata caches not cleared; Cloudflare signup/auth excluded.
- Parsed original ISO timestamps as strings for the elapsed-time calculation, avoiding PowerShell automatic date conversion. The recorded positive duration is checked in data/setup-rehearsal.json.
- Fresh clone passed frontend production build, Worker types and dry-run bundle. CUA drove the fixed-query browser regression from the clone:all10 reference queries,50 blocked cases,15 semantic-preservation cases,500-row cap and8ms observed timeout/reload passed. Browser driver initially timed out waiting for its report; state inspection showed completion and the existing result was saved without rerunning.
- Audited first commit:PLAN.md only, unchanged since14c9550. Clone model-source hashes match the revised evaluation snapshot. Clone tracked files remained clean after checks.
- Pattern scan of tracked/unignored files found no known credential assignments/private keys; scan is not a comprehensive secret guarantee. Credentials remain in Wrangler's external login store. No GitHub remote is configured.
- Rewrote README for reviewer setup, condensed AI-USAGE to about half a page, and organized VERIFICATION around results/evidence/limitations. Original history remains in Git and this log. PLAN.md was not rewritten.
- Added WALKTHROUGH.md with architecture, code boundaries, math, decisions, join/large-data changes and pairing exercises. This prepares the explanation but does not certify the candidate's personal understanding; rehearsal remains a human action.
- Final copy-only UI refinements:singular note label and generic verification workbench heading. Core model/query behavior unchanged from the rehearsed clone.
- Source, test/evaluation evidence and documentation are locally ready for review. No interview app deployment or GitHub publishing was performed; the candidate's Hello World sample is separate.
- Step8 began around22:11 Europe/Bucharest. Timings are wall-clock observations; active effort was not separately measured. Final checkpoint follows.


Final Step 8 checks:temporary clone server processes on5174/8790 stopped; main5173 API still reports live mode and the pinned model. Browser automation became unavailable during tab cleanup, so no claim that all temporary tabs were explicitly closed. Existing main app was verified through its local health API. Final type/build checks passed after copy-only label updates. First PLAN commit and unchanged contents verified; final local audit saved. No GitHub remote is configured. Final checkpoint recorded1 November2026 around22:36 Europe/Bucharest.


## Optional extension: constrained generation

- User approved the proposed verification skill and semantic-layer extension.
- Committed extension plan and skill before implementation (2b1fb63), preserving original PLAN.md. Used skill-creator guidance; installed PyYAML only into ignored work/ for its format validator, which passed.
- Added strict four-metric catalog, trusted compiler, metadata-only Worker route and visible UI mode/definition. Manual edits leave semantic calculations and retain SQL checks.
- Used the new verification skill: 158 tests, type checks, frontend build, Worker dry-run; checked every catalog combination.
- Committed exact evaluation protocol and source hashes before the live batch (2567cb0). Executed eight independent-answer compiler checks and 33 first-attempt live requests in the actual browser.
- Recorded both failures: local reload interrupted cards (503); unsupported average fare selected average distance. No hidden retries or rewriting scores. Separate live UI recovery returned 2,319,036; manual SQL edit displayed Edited SQL and returned 7.
- Findings in SEMANTIC-LAYER.md separate accuracy, designed coverage, refusal behavior and limits. Flexible SQL stayed the default. No deployment, publishing or paid-plan change.

## Requirements review — 2 November 2026

Used verify-talk-to-data to compare the brief with the current repository. Reran 158 Node tests, both type checks, frontend build and Worker dry-run: passed. Actual-browser regression passed 10 reference queries, 50 rejected and 15 allowed SQL fixtures, cap, runtime guards and timeout/reload. Confirmed original first-commit plan and pinned dataset. Corrected README clone URL/test count and clarified which core setup evidence predates the extension. No inference rerun or new clean-clone/onboarding timing claim. Evidence and known limitations retained in VERIFICATION.md and new dated reports.
