import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compilePlan,
  metrics,
  dimensions,
  filters,
} from "../shared/metrics.ts";
import { validateSql } from "../src/sql-validator.ts";
import worker from "../worker/index.ts";
import { fixtures } from "../worker/fixtures.ts";
import { createApi } from "../src/api.ts";
const base = {
  metric: "trip_count",
  dimension: "none",
  filter: "all",
  order: "natural",
  rationale: "Count January pickups.",
};
function request(body: unknown, origin?: string) {
  return new Request("http://localhost/api/metrics", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}
test("every catalog combination compiles through the existing SQL guard or rejects incompatible choices", () => {
  let compiled = 0,
    rejected = 0;
  for (const metric of Object.keys(metrics))
    for (const dimension of Object.keys(dimensions))
      for (const filter of Object.keys(filters))
        for (const order of ["natural", "top5"]) {
          if (
            (order === "top5" && dimension === "none") ||
            (metric === "card_tip_percentage" && filter === "cash")
          ) {
            assert.throws(() =>
              compilePlan({ ...base, metric, dimension, filter, order }),
            );
            rejected++;
            continue;
          }
          const result = compilePlan({
            ...base,
            metric,
            dimension,
            filter,
            order,
          });
          assert.ok(result.sql);
          assert.match(validateSql(result.sql).executionSql, /LIMIT 501$/);
          compiled++;
        }
  assert.equal(compiled, 105);
  assert.equal(rejected, 23);
});
for (const patch of [
  { sql: "DROP TABLE trips" },
  { metric: "SUM(fare_amount)" },
  { metric: "__proto__" },
  { dimension: "constructor" },
  { filter: "all; DROP TABLE trips" },
  { order: "DESC" },
  { rationale: "" },
  { rationale: "a".repeat(301) },
  { metric: [] },
  { dimension: ["none"] },
  { order: ["natural"] },
  { metric: null, filter: "card" },
  { metric: "card_tip_percentage", filter: "cash" },
  { order: "top5" },
])
  test(`rejects invalid plan ${JSON.stringify(patch).slice(0, 90)}`, () =>
    assert.throws(() => compilePlan({ ...base, ...patch })));
test("tip definition is ratio of sums with mandatory card and positive-fare cohort", () => {
  const sql = compilePlan({ ...base, metric: "card_tip_percentage" }).sql!;
  assert.match(
    sql,
    /100\.0 \* SUM\(tip_amount\) \/ NULLIF\(SUM\(fare_amount\), 0\)/,
  );
  assert.match(sql, /payment_type = 1 AND fare_amount > 0/);
  assert.doesNotMatch(sql, /AVG/);
});
test("unsupported plan emits no SQL", () =>
  assert.equal(compilePlan({ ...base, metric: null }).sql, null));
test("metric request uses only question, not SQL/results/context, and checks returned plan", async () => {
  let seen: any;
  const compiled = compilePlan(base);
  const api = createApi(async (url, options) => {
    seen = { url, body: JSON.parse(String(options?.body)) };
    return Response.json({
      mode: "live",
      model: "test",
      generationMode: "metrics",
      contextMode: "catalog",
      ...compiled,
      rationale: base.rationale,
      snippets: [],
    });
  });
  const result = await api.generate("count", undefined, "metrics");
  assert.deepEqual(seen, { url: "/api/metrics", body: { question: "count" } });
  assert.equal(result.plan?.metric, "trip_count");
});
for (const fixture of fixtures)
  test(`metric fixture compiles without calling model: ${fixture.question}`, async () => {
    const r = await worker.fetch(request({ question: fixture.question }), {
      MODE: "fixture",
      AI: {
        run() {
          throw Error("Must not call");
        },
      },
    });
    assert.equal(r.status, 200);
    const body: any = await r.json();
    assert.equal(body.mode, "fixture");
    assert.equal(body.generationMode, "metrics");
    assert.match(body.executableSql, /LIMIT 501$/);
  });
test("live metric model receives catalog metadata, never records or oracle answers", async () => {
  let calls = 0;
  const r = await worker.fetch(request({ question: "Count January pickups" }), {
    MODE: "live",
    AI: {
      async run(_model, input) {
        calls++;
        assert.equal(input.messages[1].content, "Count January pickups");
        assert.equal(input.temperature, 0);
        assert.equal(input.max_tokens, 500);
        assert.ok(!JSON.stringify(input).includes("2964606"));
        return { response: base };
      },
    },
  });
  assert.equal(r.status, 200);
  assert.equal(calls, 1);
});
for (const value of [
  undefined,
  "not json",
  { ...base, sql: "SELECT * FROM trips" },
  { ...base, metric: "average_fare" },
])
  test(`invalid model plan never emits executable SQL: ${JSON.stringify(value)}`, async () => {
    const r = await worker.fetch(request({ question: "Count trips" }), {
      MODE: "live",
      AI: {
        async run() {
          return { response: value };
        },
      },
    });
    assert.equal(r.status, 422);
    const body: any = await r.json();
    assert.equal(body.error.code, "PLAN_REJECTED");
    assert.equal(body.executableSql, undefined);
  });
test("missing AI binding remains an explicit failure in metric mode", async () =>
  assert.equal(
    (await worker.fetch(request({ question: "Count trips" }), { MODE: "live" }))
      .status,
    503,
  ));
test("metric refusal is explicit and no fixture fallback occurs", async () => {
  const r = await worker.fetch(request({ question: "Average metered fare" }), {
    MODE: "live",
    AI: {
      async run() {
        return {
          response: {
            ...base,
            metric: null,
            rationale: "Average fare is outside the catalog.",
          },
        };
      },
    },
  });
  assert.equal(r.status, 422);
  assert.equal(((await r.json()) as any).error.code, "UNSUPPORTED_QUESTION");
});
test("metric API rejects extra rows and wrong origin before model execution", async () => {
  assert.equal(
    (
      await worker.fetch(request({ question: "Count", rows: [1] }), {
        MODE: "fixture",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        request({ question: "Count" }, "https://evil.example"),
        { MODE: "fixture" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(request({ question: "Count", contextMode: "none" }), {
        MODE: "fixture",
      })
    ).status,
    400,
  );
});
