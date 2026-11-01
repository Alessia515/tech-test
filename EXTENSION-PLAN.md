# Optional extension: constrain generation

Added after the completed core submission (410ad72). The original PLAN.md and historical evaluation reports remain unchanged.

Build one small semantic layer alongside flexible SQL. The model selects a structured plan; trusted code supplies every identifier, expression, filter, and ordering clause. Four metrics: trip count, summed metered fare, average distance, and card tip percentage (ratio of sums over card trips with positive fares). Dimensions: none, pickup day, pickup hour, pickup zone. Fixed filters: all, card, cash, distance over ten miles. January 2024 remains the fixed period.

The UI shows the chosen definition and generated SQL. Manual edits use the existing SQL validator but leave the semantic layer's guarantees. A valid plan can still select the wrong metric: structural correctness does not prove that the model understood the question.

Verify compiler rejection and metric definitions, Worker privacy and failure behavior, and execution against independently established dataset answers. Keep flexible SQL available for comparison. Separate supported-question accuracy, coverage, and safe refusals; do not count every refusal as a successful answer. Preserve failed first attempts and report model settings and sample size. Do not change historical reports to fit the new feature.

Also add and actually use a repository-local verification skill. Its purpose is repeatable evidence, not a claim that skills were used for the original build. No deployment or paid-plan change is part of this extension.
