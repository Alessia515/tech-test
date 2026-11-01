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

