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

