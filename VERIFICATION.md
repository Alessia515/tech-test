# Verification

## Recorded outcome

Model: **@cf/meta/llama-3.3-70b-instruct-fp8-fast**, temperature 0, maximum output 800 tokens. The revised paired browser run completed 31 requests in **82.8 seconds**.

| Revised live batch | Retrieved context | No retrieved context |
| --- | --- | --- |
| Ten golden questions | **10/10** | 9/10 |
| Four semantic cases | **4/4** | 0/4 |
| Three malicious prompts | **3/3 blocked** | not run |

```text
Node tests: 127 passed, 0 failed
Browser reference queries: 10/10 match independent expectations
Browser malicious SQL fixtures: 50/50 blocked
Browser allowed SQL fixtures: 15/15 preserve original results after compilation
Result limit: 500 rows with truncation flag
Actual database timeout/reload: passed (5 ms test budget, 8 ms observed in fresh clone)
Frontend types/build: passed
Worker types/dry-run bundle: passed; no deployment
Fresh clone: expected fixture table visible in 324.097 seconds
```

These are bounded observations on a small, chosen set, not arbitrary-question correctness or exhaustive security guarantees. Original failed results, the scorer audit and the revised results are preserved separately.

## Golden answers and semantic correctness

[data/golden.json](data/golden.json) contains ten questions, reference SQL, expected values/shapes and tolerances. [scripts/reference-answers.mjs](scripts/reference-answers.mjs) streams raw columns via native DuckDB and computes filtering/grouping/aggregates in JavaScript; the browser separately executes SQL with DuckDB-WASM. This avoids using generated SQL as its own oracle, but both paths share DuckDB's Parquet decoding. Metric definitions still need human review.

| Golden ID | Expected answer/shape | Retrieved | None |
| --- | --- | --- | --- |
| count | 2,964,606 January pickups | pass | pass |
| daily | 31 date/count rows; exact counts in golden.json | pass | pass |
| distance | 3.6521704908 recorded miles on average | pass | pass |
| fare | $53,881,922.66 metered fare | pass | **fail** |
| cards | 2,319,036 card trips | pass | pass |
| tips | 22.4676838945% ratio of summed tips to positive card fares | pass | pass |
| pickups | IDs 132, 161, 237, 236, 162 in rank order; counts optional | pass | pass |
| hours | 24 hour/count rows | pass | pass |
| long-fare | $62.88094457 average fare over ten miles | pass | pass |
| empty | no rows for contradictory date filters | pass | pass |

The raw file has 2,964,624 rows: eighteen pickups fall outside January, with timestamps as early as 2002. January metrics use the half-open pickup range [2024-01-01, 2024-02-01). Negative adjustments and anomalous distances are retained unless exclusions are requested. Recorded tips do not include cash tips. Fare means fare_amount, not total_amount.

The comparator checks shape/values, permits aliases and one consistent column permutation, and treats daily/hour groups as sets. Ranked IDs preserve order. Monetary totals allow one cent; other floating aggregates allow 0.000001 absolute difference. Midnight date representations normalize to a date; non-midnight timestamps do not. BIGINT values remain exact strings. NULL differs from zero. A small JSON-report fix now records NaN/Infinity explicitly; the original reports' nonfinite-to-null serialization is documented in [data/nonfinite-replay.json](data/nonfinite-replay.json), without altering their failed scores.

### Actual errors found

- **Wrong metered fare:** without context, the model added extras, taxes, tips and tolls, returning about **$73,962,704.95**. The query executed and confidently described the wrong measure. With the definition, SUM(fare_amount) matched the independent answer.
- **Wrong tip metric:** initially both conditions used AVG(tip_amount/fare_amount)*100, returning **28.695695%**, instead of SUM(tip_amount)/SUM(fare_amount)*100 = **22.467684%**. Retrieved IDs showed the critical tip-ratio note was omitted from the top four.
- **False evaluator failure:** the pickup question asks for IDs; the reference also included counts. Both models returned correct ranked IDs. Initial automation reported 7/10 in both conditions; replaying stored results with counts optional gives **8/10 each**. This is a scorer correction, not model improvement. Wrong ranks and incorrect supplied counts still fail. Oracle values/tolerances were unchanged.
- **Malformed empty-answer proposal:** one initial response supplied the string "null" as SQL for contradictory filters. It was safely rejected, but should have produced a query returning an empty table.

## Retrieval experiment

The protocol was committed as **8b72f9d before generation**. Each batch includes the ten goldens and four supplemental questions in both conditions, plus three attack prompts. Condition order alternates. Within a batch, model/settings/schema/shared rules remain fixed; only curated notes differ. Expected answers, observed rows and results are never sent back to the model. No case is automatically retried or repaired using data feedback.

Evidence:

- [Initial raw run](data/evaluation-initial.json), [explicit scorer audit](data/evaluation-initial-audit.json).
- [Revised run](data/evaluation-revised.json), [source/policy snapshot](data/evaluation-revised-baseline.json).
- Revisions committed as **c4b968f** before the second batch: rare-term/IDF weighting, removal of generic cash-example triggers, clarification of real JSON null and answerable contradictory filters. The pickup scorer correction is separate from model quality.

In the revised run, the tip-ratio note is retrieved and the generated query uses the ratio of totals. No-context metered fare still fails. The supplemental cases were declared before the first batch:

| Semantic question | Retrieved | None |
| --- | --- | --- |
| Default January card tip rate | correct documented metric | wrong formula/exclusions |
| Actual cash tip total | correct refusal | substitutes card tips |
| Busiest borough | correct refusal: lookup absent | substitutes numeric zone ID |
| Total paid including cash tips | correct refusal | omits unrecorded cash tips |

A proxy answer to a different question fails our contract. The default tip metric is the app's documented definition, not a universal meaning of “rate.” Retrieval improves the recorded paired cases **14/14 versus 9/14**. The four supplemental cases deliberately target documented rules; they are not a random large sample. Shared instructions also changed across batches, so before/after gains are not an isolated causal test of ranking. Repeatability and unseen-question accuracy remain unmeasured.

## Attacking the validator

The guard uses a pinned PostgreSQL parser but supports only a reviewed subset. It validates known identifiers/functions/types and reconstructs SQL; it does not forward raw input. Browser edits and model proposals use the same gate. Unknown syntax fails closed. The compiled outer LIMIT is trusted runner code, not an untrusted subquery exception.

[tests/sql-cases.json](tests/sql-cases.json) and browser evidence cover:

| Attempt | Observed outcome |
| --- | --- |
| DROP/DELETE/UPDATE/CREATE, mixed case and comment prefixes | blocked |
| Stacked SELECT; DROP / SELECT; SELECT / comments before COPY | blocked |
| Read-only, modifying and recursive CTEs; nested subqueries; UNION; joins | blocked by intentionally restricted grammar |
| read_parquet URL, read_csv path, glob, quoted URL, system catalogs | blocked |
| Scalar read_blob/query/query_table/getenv/nextval/setseed/write_log | blocked |
| Quoted/schema-qualified function variants | blocked |
| ATTACH, COPY TO path/URL, SELECT INTO, INSTALL/LOAD, SET/PRAGMA | blocked |
| Unknown columns/qualifiers, windows, range/repeat, unsupported casts | blocked |
| SQL-looking text in string literals, benign comments and case changes | accepted with preserved browser result semantics |

All **50 rejected and 15 allowed fixtures** passed in both the original browser checks and fresh-clone regression. Node tests establish zero execution-driver calls for rejected SQL, stable compilation/quoting, bounded input complexity, schema agreement, concurrency rejection, ordinary-error recovery and session invalidation.

Trusted probes bypass the validator deliberately: an external read fails because filesystem access is disabled; re-enabling access fails because configuration is locked. Request logs originally showed only the signed Parquet startup extension. The revised live prompts requesting DROP, stacked SELECT/DROP, and a network CSV were all explicitly refused/blocked; their proposals were never executed. This is not exhaustive injection coverage or a sandbox against a user controlling developer tools.

## Setup and UI evidence

A fresh local clone of **9eae8d4** used an empty package-content store: **113 downloaded, zero reused**. The 49,961,641-byte dataset was freshly downloaded and checksum-verified. Installation, data download and 127 Node tests took **20.590 seconds**. The expected fixture result was rendered **324.097 seconds** after clone start, including a sandbox connection timeout and server restart. See [data/setup-rehearsal.json](data/setup-rehearsal.json).

Prerequisites were already installed: Node 24.22.1, pnpm 11.25.0 and Edge. Registry metadata/browser/CDN caches were not cleared. Cloudflare signup/login was excluded: the rehearsal used explicitly labelled fixtures. Isolated ports 5174/8790 and an origin/proxy override kept the main app running. This demonstrates setup on this machine; it is not a universal ten-minute guarantee or a cold-machine account-onboarding benchmark.

The fresh clone also passed frontend build, Worker type checks/dry-run build, and the full fixed-query browser regression: [data/clone-browser-checks.json](data/clone-browser-checks.json). A sandboxed server was initially unreachable from the host browser; restarting it outside that execution sandbox resolved access. No application change was needed. The browser driver briefly timed out waiting for the report; inspection showed completion, and the completed report was saved without rerunning. Changes between that rehearsal and core finalization were documentation/evidence and two UI labels; final frontend type/build checks passed. The optional semantic-layer extension was added later and has separate evidence below.

Actual UI checks cover live/fixture provenance, editable reruns, stale-result clearing, DROP/stacked/file-read messages, empty and truncated results, generation cancellation, DuckDB binding errors and recovery. A real live count matched the independent golden answer: [data/ui-live-result.json](data/ui-live-result.json). Timestamps display without browser-local timezone conversion; submillisecond display precision is not guaranteed.

## Known failures and limits

1. **Lexical vocabulary gaps.** “For card payments, what fraction of fare went to gratuities in January?” misses tip-ratio. Tags lack fraction/gratuities coverage and naive plural stripping is insufficient. [The retrieval-only probe](data/retrieval-paraphrase-probe.json) is post-run exploratory evidence, not pooled into scored model results. No SQL answer was generated for it.
2. **Offline startup fails without the CDN extension.** The engine is bundled locally, but Parquet support loads a signed extension during initialization. Vendoring supported variants remains future work.
3. **Intermediate memory is not capped.** Materialization/grouping/sorting can consume much more than compressed file size. A row cap limits transfer/rendering; timeout may occur after allocation failure. Low-memory/mobile operation is unverified.
4. **Local tooling reload can lock.** workerd crashed with SQLITE_BUSY_RECOVERY during a revised preflight, before inference. Separate live/fixture state paths allowed the complete next batch, but concurrent reload/OneDrive behavior is not stress-tested. Initial OAuth scopes also missed Workers Scripts permission; adding the specific scope fixed the preview API. Some initial inference failures remain unexplained rather than falsely diagnosed.
5. **Coverage and hosting are limited.** Valid advanced DuckDB syntax fails closed. Public authentication/rate limits, broad prompt-injection robustness and provider-side cancellation are not established. A free-text user can paste data into a question; the app prevents automatic row/result uploads, not arbitrary text disclosure.

The frontend build retains a ~740 kB shared-chunk warning; dependency installation emits a nonessential Arrow CLI shim warning. Actual imports, builds and browser queries pass. Neither warning was suppressed or represented as a test failure.

## Reproduce

- `pnpm test`, `pnpm check`, `pnpm build`, `pnpm build:worker`: no inference calls.
- Start Vite, then `pnpm test:spike`: fixed-query browser regression, including real worker termination/reload.
- Start the live Worker, then `pnpm evaluate:live`: 31 inference requests, writes data/evaluation-latest.json and prints pass/fail. Exit status gates retrieved-mode failures; no-context failures remain visible. Fixtures are refused.
- Alternatively use **Run data spike** / **Run live golden comparison** at /verify.html. Recorded browser runs were driven via CUA; the CLI is a wrapper for the same page, not an additional claimed run.

The initial PLAN.md remains unchanged. Final scope decisions are summarized below. Detailed preparation notes were removed from the current submission; their earlier commits remain in Git history. The original plan's reference to PROGRESS.md describes that historical log.

## Changes from the original plan

- **Narrow SQL grammar:** parser and browser experiments justified rejecting all CTEs, joins, subqueries, windows and other unsupported syntax rather than attempting broader DuckDB compatibility. The validator attack and semantic-preservation results above establish the tested boundary.
- **Startup dependency:** actual browser requests disproved the assumption that every engine asset was local. Parquet support loads a signed CDN extension during trusted initialization; offline startup remains unsupported.
- **Retrieval and scoring revisions:** an omitted tip-ratio note prompted rare-term weighting and removal of generic cash-example triggers. A separate scorer mistake required allowing omitted counts for an IDs-only ranking question. Original reports and the explicit audit remain preserved; expected values were not changed to fit generated answers.
- **Live access versus setup:** account onboarding, OAuth permissions and local runtime failures required investigation. Explicit fixture mode supports credential-free setup checks without substituting for live model evidence. Isolated live/fixture persistence paths address an observed SQLite lock. The recorded fresh-clone timing excludes Cloudflare onboarding.
- **Optional extension after core completion:** a four-metric semantic layer and repository-local verification skill were planned in commit 2b1fb63, then implemented alongside flexible SQL. Its fixed compiler trades coverage for stable definitions; valid plan selection can still answer the wrong question. SEMANTIC-LAYER.md and the separate 33-request report retain the observed failures.
- **Timing:** setup and evaluation durations above are measured observations. Total active development effort was not separately measured; wall-clock checkpoints included candidate pauses, approvals and tool waits. No precise total against the five-hour timebox is claimed.

## Optional semantic-layer extension (later source version)

The core scores above remain historical. See SEMANTIC-LAYER.md and data/semantic-first-attempt.json for a separate, predeclared 33-request comparison. Compiler execution passed 8/8 browser reference checks. Defined metrics answered 9/10 supported cases correctly, with one local-reload HTTP 503; a separately recorded recovery passed. One unsupported average-fare question wrongly selected average distance, demonstrating that valid plans can misinterpret intent. Designed coverage is 10/12 data-answerable cases; missing-data refusals passed 3/3 and metrics-only attacks 3/3. Flexible SQL answered 12/12 data-answerable cases in this batch. No accuracy improvement is claimed.

Extension validation: 158 Node tests passed, types passed, frontend build and Worker dry-run passed. All 105 compatible catalog combinations pass the SQL guard; 23 incompatible combinations reject. The new verification skill was format-validated and used for these checks. Live evaluation ran through the browser workbench; pnpm evaluate:metrics is the reviewer wrapper, not an additional claimed run.

## Requirements review — 2 November 2026

Used the repository's `verify-talk-to-data` skill to compare the original brief with source, documentation, history and recorded evidence. Fresh checks passed: 158 Node tests, frontend/Worker types, frontend production build and Worker dry-run bundle. The shared-chunk warning remains.

Fresh actual-browser regression passed 10/10 reference queries, blocked 50/50 SQL attacks and preserved results for 15/15 allowed queries. The 500-row cap, both runtime restrictions, real worker termination (7 ms with a 5 ms test budget), and reload to 2,964,624 raw rows also passed. Evidence: [browser report](data/browser-review-2026-11-02.json), [requirements audit](data/requirements-review.json). No new inference batch, clean-clone rehearsal or deployment was performed.

Confirmed the first commit contains only PLAN.md and that its contents remain unchanged; the 49,961,641-byte dataset matches its pinned checksum. The default path satisfies the requested question → retrieval/Worker/model → visible/editable SQL → browser DuckDB architecture. Request contracts and tests prevent automatic row/result uploads. The original revised paired retrieval experiment and extension failures remain preserved rather than being represented as fresh model runs.

Corrected two README details: the real repository clone URL and current 158-test count. The prior under-ten-minute result remains qualified: fixture-mode setup with preinstalled prerequisites, excluding Cloudflare account/login. Known semantic, retrieval, memory and startup limits remain open. This review supports the core requirements; it does not establish that every natural-language question is answered correctly.
