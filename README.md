# Talk to Your Data

The app connects plain-English questions to a Cloudflare Worker, retrieves dataset notes, generates SQL with Workers AI, validates it, and executes it locally in DuckDB-WASM. The SQL is visible and editable, with a separate local run button. Verification and clean-clone rehearsal are still in progress.

## Run the spike

Prerequisites: Node 22+, pnpm 11.25.0, a modern desktop browser, and internet access. If pnpm is missing, install it with `npm install --global pnpm@11.25.0`.

```sh
pnpm install --frozen-lockfile
pnpm data
pnpm dev
```

Open http://127.0.0.1:5173. The dataset loads automatically. Start one Worker API mode in another terminal (see below), choose an example and click **Ask & run**. The badge identifies live AI or canned fixtures. Inspect or edit the SQL and use **Run SQL locally** to rerun it without calling the model. Expand **SQL executed locally** to see the exact validated, capped query. Editing SQL clears the previous result so it cannot be mistaken for a new answer.

The ~50 MB Parquet file is checksum-verified and served locally; engine WASM files are bundled locally. DuckDB downloads its signed Parquet extension from extensions.duckdb.org during trusted initialization. Startup therefore is not offline. The separate http://127.0.0.1:5173/verify.html page retains the fixed-query data/validator spike used by `pnpm test:spike`.

The app materializes an in-memory `trips` table, drops the registered source file, disables external access, and locks configuration. Every generated/edited query uses the same runner, which validates and reconstructs SQL, caps displayed results at 500 rows, and terminates its worker on a ten-second timeout. Cancel stops generation waiting, or terminates the database if a local query is running. Use **Reload dataset** after database termination. Ordinary query errors leave the session usable.

## Reproduce checks

With the dev server running:

```sh
pnpm inspect:data
pnpm reference:data
pnpm test:validator
pnpm test:spike
pnpm build
```

The browser test uses installed Microsoft Edge on Windows. Elsewhere, run `pnpm exec playwright install chromium` first. Set `BROWSER_CHANNEL` to `chrome` or `msedge` if you want to use another installed supported browser.

`inspect:data` writes the native schema/count inspection; `reference:data` calculates ten expected answers in JavaScript from raw columns. `test:validator` tests parsed SQL and query lifecycle; `test:spike` checks validated browser SQL results, 50 rejected and 15 accepted cases, runtime restrictions, result capping, and a real worker timeout/reload. The spike loads the dataset three times to test recovery; use it as verification rather than a normal user flow. These checks do not yet test model output.

The supported subset is intentionally small: one trips table, standard comparisons/arithmetic, IN, NULL checks, grouping, sorting, simple casts, date extraction, COUNT/SUM/AVG/MIN/MAX, and a few approved scalar functions. CTEs, joins, subqueries, UNION, windows, CASE, FILTER, OFFSET, custom functions/types and backslash string escapes are rejected. Use standard SQL single-quote doubling. See src/sql-validator.ts for the explicit allowlist and VERIFICATION.md for its limits.

Dependencies are pinned in package.json and pnpm-lock.yaml. `@duckdb/node-api` is development-only; it reads the dataset for verification, not as part of the app or Worker. Downloaded Parquet, build output, and dependencies are ignored by Git. No clean-clone timing claim has been established yet.

## Worker API (Step 5)

Start one API mode in a second terminal, alongside `pnpm dev`:

```sh
# No account or model calls; five exact canned questions only:
pnpm worker:fixture
```

Fixture mode has its own configuration with **no AI binding**. GET http://127.0.0.1:5173/api/health lists its five supported example questions and identifies the mode. `pnpm test:worker:http` checks them through the actual Worker and Vite proxy. Fixture success is not live-generation evidence.

For live generation, use a Cloudflare Free account and complete Workers setup in the dashboard. If an old `/workers/onboarding` link gives 404, use Workers & Pages in the dashboard; do not assume a purchase or paid plan is needed. This account completed onboarding through the Hello World flow; that sample Worker is separate from the interview app. Wrangler login opens Cloudflare's consent screen and stores credentials outside this repository:

```sh
pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write ai:write
# Stop the fixture API before using the same port:
pnpm worker:live
pnpm smoke:live
```

Both normal API commands use loopback port 8787. During development we also run live on 8788 to keep the fixture API available; in that case set API_BASE=http://127.0.0.1:8788 for the smoke script. The Vite proxy targets 8787 by default. No live failure silently falls back to fixtures.

To point the app at a different local API, set API_TARGET before starting Vite. Current development session uses API_TARGET=http://127.0.0.1:8788 and shows **Live AI**. For PowerShell: `$env:API_TARGET='http://127.0.0.1:8788'; pnpm dev`. For POSIX shells: `API_TARGET=http://127.0.0.1:8788 pnpm dev`. A fresh setup with the documented default ports needs no API_TARGET variable.

Live smoke evidence is in data/live-smoke.json and data/live-smoke-none.json. The first is a real retrieved-context model response, the second the same question without notes. Both passed SQL validation; the script does not execute the query. Set CONTEXT_MODE=none to reproduce the second request. One basic count question is not evidence that retrieval improves accuracy; the broader comparison is pending.

Model ID: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, configurable as MODEL_ID in wrangler.jsonc. MODE, MODEL_ID and FRONTEND_ORIGIN are nonsecret Worker variables. AI is a remote Workers AI binding; even local Worker execution needs internet/account authorization for inference. No application API key is required when using the binding. Secrets, if added, belong in Wrangler bindings or ignored .dev.vars, never Vite/browser variables.

Endpoints:

- GET `/api/health`: mode, model, binding presence, fixture examples. Binding presence alone does not prove inference access.
- POST `/api/generate`: JSON `{ "question": "How many trips had pickups in January 2024?", "contextMode": "retrieved" }`. Optional contextMode=`none` runs the same model/schema/safety/time rules without retrieved notes for evaluation. It never changes to fixture mode.
- A successful response contains proposed SQL, capped executable SQL, rationale, model/mode, and retrieved note IDs/text/scores. Rejected model SQL returns HTTP 422 with the inspectable proposal and validation reason. Missing-data refusals return a readable explanation. Model/network failures return explicit errors.

Only question and contextMode are accepted, with a 4096-byte body and 1000-character question cap. No dataset rows, query results, data previews, or browser-provided schema are accepted. Users can still paste arbitrary content into free text; the app cannot prove a question contains no rows. The Worker logs no request bodies, prompts or SQL itself. The only outbound model payload contains the question, static schema, fixed rules and up to four of 18 curated notes. It imports neither Parquet nor the golden expected results. Lexical retrieval is deterministic and inspectable; no Vectorize provisioning is required.

API checks: `pnpm test:worker`, `pnpm check:worker`, `pnpm build:worker`. The last command bundles with `--dry-run`; it does not deploy. The compatibility date is pinned to 2026-10-30, supported by the pinned local runtime. pnpm-workspace.yaml permits only the pinned esbuild/workerd install scripts needed by Wrangler.

As checked on 1 November 2026, Workers AI Free includes 10,000 Neurons/day and requests stop at the free limit; our model is not among the listed paid-only models. See https://developers.cloudflare.com/workers-ai/platform/pricing/. Model timeout is a 30-second response-wait limit; it does not guarantee provider-side cancellation. This is a local prototype, without public authentication or distributed rate limiting; public hosting needs that separate decision.
