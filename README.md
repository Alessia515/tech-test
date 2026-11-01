# Talk to Your Data

Work in progress: Steps 3–4 verify browser data loading, a restricted SELECT validator, and query execution limits. There is no LLM integration or user SQL editor yet.

## Run the spike

Prerequisites: Node 22+, pnpm 11.25.0, a modern desktop browser, and internet access. If pnpm is missing, install it with `npm install --global pnpm@11.25.0`.

```sh
pnpm install --frozen-lockfile
pnpm data
pnpm dev
```

Open http://127.0.0.1:5173 and click **Run data spike**. The ~50 MB Parquet file is checksum-verified and served locally; engine WASM files are bundled locally. DuckDB downloads its signed Parquet extension from extensions.duckdb.org during trusted initialization. Startup therefore is not offline. No model credentials are needed for this spike.

The app materializes an in-memory `trips` table, drops the registered source file, disables external access, and locks configuration. The query runner validates and reconstructs SQL before executing it, caps displayed results at 500 rows, and terminates its worker on a ten-second timeout. Arbitrary user SQL is not currently exposed; the upcoming editor must use this runner.

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
