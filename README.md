# Talk to Your Data

Work in progress: Step 3 is a browser/data feasibility spike. There is no LLM integration or user SQL editor yet.

## Run the spike

Prerequisites: Node 22+, pnpm 11.25.0, a modern desktop browser, and internet access. If pnpm is missing, install it with `npm install --global pnpm@11.25.0`.

```sh
pnpm install --frozen-lockfile
pnpm data
pnpm dev
```

Open http://127.0.0.1:5173 and click **Run data spike**. The ~50 MB Parquet file is checksum-verified and served locally; engine WASM files are bundled locally. DuckDB downloads its signed Parquet extension from extensions.duckdb.org during trusted initialization. Startup therefore is not offline. No model credentials are needed for this spike.

The app materializes an in-memory `trips` table, drops the registered source file, disables external access, and locks configuration. This does not replace the SELECT-only validator, which is the next step. Arbitrary user SQL is not currently exposed.

## Reproduce checks

With the dev server running:

```sh
pnpm inspect:data
pnpm reference:data
pnpm test:spike
pnpm build
```

The browser test uses installed Microsoft Edge on Windows. Elsewhere, run `pnpm exec playwright install chromium` first. Set `BROWSER_CHANNEL` to `chrome` or `msedge` if you want to use another installed supported browser.

`inspect:data` writes the native schema/count inspection; `reference:data` calculates ten expected answers in JavaScript from raw columns; `test:spike` compares browser SQL results against them and checks two runtime restrictions. See VERIFICATION.md for actual results and limits. These checks do not yet test model output.

Dependencies are pinned in package.json and pnpm-lock.yaml. `@duckdb/node-api` is development-only; it reads the dataset for verification, not as part of the app or Worker. Downloaded Parquet, build output, and dependencies are ignored by Git. No clean-clone timing claim has been established yet.
