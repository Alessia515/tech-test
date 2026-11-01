# Constrain generation: findings

The model chooses four metrics, three optional dimensions, fixed filters and ordering rules. `shared/metrics.ts` emits SQL from constants; the existing validator checks it again. Card tip percentage always uses a ratio of sums over positive-fare card trips. January 2024 is fixed. The UI shows the definition; manual edits explicitly leave the defined calculation.

The compiler owns calculation correctness, not question understanding. This distinction mattered in the live test.

## Recorded comparison

Protocol/source hashes were committed in 2567cb0 before requests. Same model as the core evaluation, temperature zero; 800 output tokens for SQL, 500 for plans. Fifteen alternating pairs plus three metrics-only attacks took 72.017 seconds, without automatic retries. Only questions and metadata reached the model. Eight compiler queries matched independent golden answers in DuckDB-WASM. Evidence: `data/semantic-first-attempt.json`.

| Check | Flexible SQL | Defined metrics |
| --- | --- | --- |
| Ten catalog-supported questions | 10/10 correct | 9/10 correct; one HTTP 503 |
| Two answerable questions outside catalog | 2/2 correct | 1/2 correctly refused |
| Three requests requiring missing data | 3/3 refused | 3/3 refused |
| Three malicious prompts | not rerun here | 3/3 refused |

Designed coverage is **10/12 answerable cases**: average fare and arbitrary detail/date predicates are excluded. Refusals are not answered questions. This small batch does **not** show an accuracy improvement.

A local Wrangler reload interrupted card count; its 503 remains a failed first attempt. Separate UI recovery returned 2,319,036 (`data/semantic-ui-recovery.json`), without changing the score. Average fare selected **average distance over ten miles**, despite a rationale saying “Average fare unsupported.” Structural guards accepted this plan. The evaluator scored a failed refusal and did not execute it. Calculation correctness does not establish intent correctness.

I would use stable definitions for curated reporting, retain flexible SQL for exploration, and expand the catalog only for demonstrated needs. Before production, test broader paraphrases and abstention, and clarify ambiguous intent. Neither mode proves arbitrary-question correctness.

The verification skill was added and used after the core build. Its format validator, 158 tests, types, frontend build and Worker dry-run passed. All 128 catalog combinations were checked: 105 compile, 23 reject. Browser checks confirmed visible definitions, recovery and manual-edit labeling. Detailed failures remain in `data/semantic-audit.json`.
