# Dataset and expected answers

Source: NYC TLC January 2024 yellow taxi trips, linked from https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page.

`manifest.json` pins the source URL, exact byte size (49,961,641), and SHA-256 checksum. `pnpm data` downloads and verifies it. No sampling, cleaning, or schema conversion is applied. `inspection.json` records the source schema and a separately executed native DuckDB summary.

There are 2,964,624 raw rows and 2,964,606 January pickup rows: 18 rows fall outside the intended month. Questions about January always use a half-open pickup range `[2024-01-01, 2024-02-01)`. The raw table retains all rows. Treat timestamps as recorded local wall-clock values; do not apply implicit browser timezone conversion.

`golden.json` is a baseline established before model integration. It contains ten questions, reference SQL, independently computed expected answers, and numeric tolerances. To regenerate: `pnpm reference:data`. This streams the six required raw columns through native DuckDB but computes filtering/grouping/aggregates in JavaScript, independently of the reference SQL run by the browser. The two paths still share DuckDB's Parquet decoding; this is not a fully independent data reader.

Metric choices: fare means fare_amount rather than total_amount; no silent removal of negative adjustments or anomalous distance values; card means payment_type=1. The tip metric is ratio of summed recorded tips to summed positive fares on card trips, not average of individual percentages and not cash tipping. Grouped results have deterministic ordering and pickup ties break by ascending ID. Monetary sums allow a one-cent floating-point difference; other floating aggregates allow 0.000001 absolute error. Counts are serialized as strings to preserve BIGINT precision.

`browser-spike.json` records actual browser output, not model results. Review metric definitions before changing expected values; do not regenerate them merely to make a failing generated query pass.
