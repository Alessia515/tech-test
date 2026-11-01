import { test } from "node:test";
import assert from "node:assert/strict";
import { compareResults } from "../src/compare-results.ts";
test("aliases and one global column permutation do not cause false failures", () => {
  assert.equal(
    compareResults(
      { columns: ["day", "trips"], rows: [["2024-01-01", "10"]], tolerance: 0 },
      {
        columns: [
          { name: "n", type: "Int64" },
          { name: "date", type: "Date32<DAY>" },
        ],
        rows: [["10", 1704067200000]],
      },
    ).passed,
    true,
  );
});
test("wrong month count and silently rounded averages fail", () => {
  assert.equal(
    compareResults(
      { columns: ["trips"], rows: [["2964606"]], tolerance: 0 },
      { columns: [{ name: "count", type: "Int64" }], rows: [["2964624"]] },
    ).passed,
    false,
  );
  assert.equal(
    compareResults(
      { columns: ["miles"], rows: [[3.65217049]], tolerance: 0.000001 },
      { columns: [{ name: "average", type: "Float64" }], rows: [[3.65]] },
    ).passed,
    false,
  );
});
test("ordered rankings stay ordered, unordered group sets can be reordered", () => {
  const expected = {
    columns: ["hour", "n"],
    rows: [
      [1, "10"],
      [2, "20"],
    ],
    tolerance: 0,
  };
  const actual = {
    columns: [
      { name: "h", type: "Int32" },
      { name: "count", type: "Int64" },
    ],
    rows: [
      [2, "20"],
      [1, "10"],
    ],
  };
  assert.equal(compareResults(expected, actual).passed, false);
  assert.equal(
    compareResults({ ...expected, unordered: true }, actual).passed,
    true,
  );
});
test("empty answers still require the expected number of columns", () => {
  assert.equal(
    compareResults(
      { columns: ["zone"], rows: [], tolerance: 0 },
      { columns: [{ name: "id", type: "Int32" }], rows: [] },
    ).passed,
    true,
  );
  assert.equal(
    compareResults(
      { columns: ["zone"], rows: [], tolerance: 0 },
      { columns: [], rows: [] },
    ).passed,
    false,
  );
});
test("midday timestamps are not silently treated as midnight dates", () => {
  assert.equal(
    compareResults(
      { columns: ["day"], rows: [["2024-01-01"]], tolerance: 0 },
      {
        columns: [{ name: "date", type: "Timestamp<MICROSECOND>" }],
        rows: [[1704110400000]],
      },
    ).passed,
    false,
  );
});
test("NULL does not equal zero and numeric tolerances remain bounded", () => {
  assert.equal(
    compareResults(
      { columns: ["n"], rows: [[0]], tolerance: 0 },
      { columns: [{ name: "n", type: "Float64" }], rows: [[null]] },
    ).passed,
    false,
  );
  assert.equal(
    compareResults(
      { columns: ["n"], rows: [[1.0]], tolerance: 0.000001 },
      { columns: [{ name: "n", type: "Float64" }], rows: [[1.0000001]] },
    ).passed,
    true,
  );
});
