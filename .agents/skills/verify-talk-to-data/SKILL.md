---
name: verify-talk-to-data
description: Verify changes to this repository's question-to-SQL pipeline, semantic metrics, SQL guards, or evaluation reports. Use when checking these changes or preparing interview evidence.
---

# Verify Talk to Your Data

Read package.json, VERIFICATION.md, and the relevant change before selecting checks. Historical scores describe their recorded source version, not every later change.

1. Run `pnpm test` and `pnpm check`. For frontend changes run `pnpm build`; for Worker changes also run `pnpm build:worker` (dry run).
2. For changes that affect query meaning, execute representative emitted SQL against the actual dataset and compare with independently defined answers. Compiler snapshots alone cannot establish correctness. Browser-specific changes also need a browser check; report when unavailable.
3. Check the model boundary: send only the question and metadata. Never send rows, query results, or reference answers. Inspect malformed responses, unsupported requests, and rejected SQL/plans.
4. Before a live evaluation, declare cases, supported coverage, comparison settings, and scoring. Use already-authorized live access only. Preserve first attempts and failures; do not retry silently or repair using reference results. Label fixtures explicitly.
5. Report accuracy on supported questions separately from coverage and refusal behavior. Include denominators, timing, model, and limitations. Preserve earlier reports; write new evidence to a new file.
6. For setup claims, state prerequisites and cache conditions. For final reporting, distinguish tests actually run from suggested commands and browser observations from HTTP checks.

Reuse existing scripts where suitable. This skill does not authorize publishing, deployment, paid upgrades, or sending data to new services.
