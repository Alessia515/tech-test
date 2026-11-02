# Talk to Your Data

Ask questions about January 2024 NYC yellow taxi trips. A Cloudflare Worker retrieves dataset documentation and asks Workers AI for SQL. The browser displays the SQL, validates it, and executes it locally with DuckDB-WASM. SQL is editable and every rerun is validated again.

## Run locally

Prerequisites: **Node 22.18+** (tested with 24.22.1), **pnpm 11.25.0**, a modern desktop browser, and internet access. If needed: `npm install --global pnpm@11.25.0`.

```sh
git clone https://github.com/Alessia515/tech-test.git talk-to-your-data
cd talk-to-your-data
pnpm install --frozen-lockfile
pnpm data
```

For **live generation**, use a Cloudflare account with Workers AI access. Complete Workers setup in the dashboard, then authorize Wrangler:

```sh
pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write ai:write
pnpm worker:live
```

In a second terminal:

```sh
pnpm dev
```

Open **http://127.0.0.1:5173/**, wait for the dataset to load, and choose **Ask & run**. Inspect or edit the SQL and use **Run SQL locally** without another model call. **SQL executed locally** shows the exact validated, capped query. Cancel stops generation waiting or terminates an executing database worker; reload the dataset after termination.

For a **credential-free setup check**, use `pnpm worker:fixture` instead of `worker:live`. This mode has no AI binding and serves only the five exact examples below as canned SQL. The app labels it clearly. It is not evidence of live model generation, and live failures never fall back to it. Run only one mode on the default API port (8787).

Fresh-clone rehearsal: **5m 24s to a rendered fixture result**, including a sandbox networking timeout/restart. Dependency installation from an empty package-content store, fresh dataset download, and 127 tests took about 21s. Node/pnpm/Edge were already installed; registry metadata/browser/CDN caches were not cleared. Cloudflare signup/login was excluded. Details: [setup evidence](data/setup-rehearsal.json).

## Example questions

These five work in fixture mode and were also exercised as live questions or equivalent golden questions:

1. How many trips had pickups in January 2024?
2. What was the average recorded trip distance in January?
3. How many January trips were paid by credit card?
4. What was the total metered fare in January?
5. What were the five busiest pickup zone IDs in January?

Additional live questions: “How many trips were picked up each day in January?” and “What was the January card tip rate?” Borough names and actual cash tips are unavailable; the app should explain that limitation.

## Verify

```sh
pnpm test                 # 158 Node tests; no inference calls
pnpm check                # frontend and Worker types
pnpm build
pnpm build:worker         # bundle only: --dry-run, no deployment
```

With Vite running, `pnpm test:spike` drives **/verify.html**: ten reference queries, 50 rejected SQL cases, 15 accepted semantic-preservation cases, runtime restrictions, truncation, and real worker timeout/recovery. It uses Edge on Windows; elsewhere run `pnpm exec playwright install chromium` first. BROWSER_CHANNEL can select an installed supported browser.

With the API in live mode, `pnpm evaluate:live` makes **31 inference requests**, runs generated table queries in browser DuckDB, writes data/evaluation-latest.json, and prints the paired results. Its exit status gates retrieved-mode failures; no-context control failures stay visible. Fixtures are refused. APP_BASE and EVALUATION_OUTPUT override its app URL/output file.

The recorded revised run passed **10/10 golden questions with retrieval versus 9/10 without**, and **4/4 supplemental semantic cases versus 0/4**. Three malicious prompts were blocked. [VERIFICATION.md](VERIFICATION.md) preserves the original failures, scorer audit, limits, and exact evidence. These small-set results do not establish arbitrary-question reliability.

`pnpm inspect:data` regenerates schema/count inspection; `pnpm reference:data` independently aggregates expected answers in JavaScript. Review metric definitions before changing golden expectations; never regenerate them merely to match model output.

## Configuration and boundaries

- Model: **@cf/meta/llama-3.3-70b-instruct-fp8-fast**, configurable as MODEL_ID in wrangler.jsonc. Temperature 0; maximum output 800 tokens.
- Bindings/variables: AI is a remote Workers AI binding. MODE, MODEL_ID, FRONTEND_ORIGIN are nonsecret variables. Wrangler login stores credentials outside the repo. Any future secrets belong in bindings/ignored .dev.vars files, never Vite variables.
- GET /api/health identifies mode/model. POST /api/generate accepts only question and optional contextMode (`retrieved` or `none`), capped at 4096 body bytes / 1000 question characters. No dataset rows, results, previews, or browser-supplied schema are accepted. Users can still paste data into free text; do not do that.
- The Worker receives a static schema and up to four of 18 curated notes, never the Parquet or expected results. It proposes SQL only. Lexical retrieval weights rare terms more highly and exposes note IDs/text/scores.
- The validator compiles a small parsed SELECT subset over trips. CTEs, joins, subqueries, UNION, windows, CASE/FILTER, OFFSET, arbitrary functions/types and external reads are rejected. Both server proposals and browser edits are untrusted.
- The browser materializes one table, drops the source registration, disables external access, and locks configuration. Results cap at 500 rows; queries time out after 10s. Memory use is not strictly bounded. The 30s model wait does not prove provider-side cancellation.
- The 49,961,641-byte Parquet download is checksum-pinned in data/manifest.json. Engine assets are local; a signed Parquet extension loads from DuckDB's CDN at startup. Offline startup is not supported.
- API_TARGET overrides Vite's default http://127.0.0.1:8787 target. Current development uses live API 8788. PowerShell: `$env:API_TARGET='http://127.0.0.1:8788'; pnpm dev`; POSIX: `API_TARGET=http://127.0.0.1:8788 pnpm dev`. FRONTEND_ORIGIN must match the browser origin when changing the app port.
- Live/fixture runtimes use separate ignored .wrangler state paths after an observed local SQLite lock. Node's DuckDB API is verification-only. This local prototype has no public authentication or distributed abuse controls.

Cloudflare's [pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/) lists a daily free allowance; actual access/limits are account-dependent. No paid upgrade or domain purchase was used in this build. Dataset attribution: [NYC TLC](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page), [field dictionary](https://www.nyc.gov/assets/tlc/downloads/pdf/data_dictionary_trip_records_yellow.pdf).

[PLAN.md](PLAN.md) is unchanged from the first commit. [PROGRESS.md](PROGRESS.md) records decisions/deviations. [WALKTHROUGH.md](WALKTHROUGH.md) is the interview preparation guide.

## Optional extension: defined metrics

Select **Defined metrics** above the question to use four trusted calculations rather than free-form SQL. Group by day, hour or numeric pickup zone; use a fixed payment or distance filter. The chosen definition remains visible beside editable SQL. Editing leaves the defined calculation, while the SELECT-only validator and query limits still apply. Flexible SQL remains the default.

The model selects a JSON plan through POST /api/metrics; shared/metrics.ts validates choices and compiles SQL. Unsupported requests should be declined rather than approximated. Fixture mode uses explicitly canned plans for the same five examples. See SEMANTIC-LAYER.md for findings and coverage limits.

The repository-local skill in .agents/skills/verify-talk-to-data/SKILL.md was added for this extension after the core build. It guides repeatable verification; it is not an application dependency.

Optional live comparison: pnpm evaluate:metrics (33 model requests, actual browser execution, no automatic retries). Requires the live Worker, downloaded data and an installed browser as described above. It writes data/semantic-latest.json; recorded historical evidence is kept separately.
