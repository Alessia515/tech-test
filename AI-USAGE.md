# AI usage

Codex was used for planning, official-documentation research, implementation, browser interaction and verification. It wrote most of the React/TypeScript app, Cloudflare Worker, retrieval notes, SQL compiler, test harnesses and documentation. The candidate set step boundaries, requested explanations, and personally completed Cloudflare account setup and OAuth approvals. PLAN.md was committed before application code.

Agent-produced assumptions were checked against actual behavior. The first claim that all assets were local was wrong: browser network inspection found DuckDB downloading its Parquet extension. Documentation was corrected and offline startup retained as a limitation. A naive lexical ranker was revised after recorded note IDs showed that a required tip definition had been crowded out.

A concrete confidently wrong agent result was the evaluator requiring trip counts for a question that asked only for pickup IDs. SQL/result review showed both models had returned the correct ranked IDs. The raw report was preserved, an explicit scoring audit added, and counts made optional while still checking any supplied counts. No expected values or tolerances were changed to fit model output.

The generation model also confidently added extras to “metered fare” and averaged per-trip tip percentages instead of dividing summed tips by summed fares. Independently calculated answers exposed both errors. The initial and revised paired evaluations remain separate in the repo; no case was silently retried or repaired using data feedback.

The implementation was largely delegated, and tests were agent-written too. They are evidence, not independent proof. WALKTHROUGH.md maps the critical code and decisions; the candidate still needs to rehearse that explanation personally before submission and pairing.

For the optional extension, AI also authored a repository-local verification skill, the fixed metric catalog/compiler, UI selection, tests and evaluation. The skill was added after the original build and then used; it was not retroactively claimed for earlier work. A live plan selected average distance for an average-fare question despite a refusal-like rationale. That failure remains visible. While preparing the reviewer command, a local reload interrupted another request; its failed first attempt and separate recovery are both recorded.
