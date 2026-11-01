type Cell = string | number | boolean | null;
export type ObservedTable = {
  columns: { name: string; type: string }[];
  rows: Cell[][];
};
type ExpectedTable = {
  columns: string[];
  rows: Cell[][];
  tolerance: number;
  unordered?: boolean;
};

function normalize(value: Cell, type: string, expected: Cell): Cell {
  if (value === null) return null;
  if (typeof expected === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expected)) {
    if (typeof value === "number" && /^(Date|Timestamp)/.test(type)) {
      const iso = new Date(value).toISOString();
      return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
    }
    if (typeof value === "string")
      return (
        value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]00:00:00(?:\.0+)?Z?)?$/)?.[1] ??
        value
      );
  }
  if (
    typeof expected === "number" &&
    typeof value === "string" &&
    /^-?\d+(?:\.\d+)?$/.test(value)
  ) {
    const number = Number(value);
    if (Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER)
      return number;
  }
  if (
    typeof expected === "string" &&
    /^-?\d+$/.test(expected) &&
    typeof value === "number" &&
    Number.isSafeInteger(value)
  )
    return String(value);
  return value;
}
function permutations(length: number): number[][] {
  if (!length) return [[]];
  const result: number[][] = [];
  function visit(prefix: number[], remaining: number[]) {
    if (!remaining.length) {
      result.push(prefix);
      return;
    }
    for (const index of remaining)
      visit(
        [...prefix, index],
        remaining.filter((value) => value !== index),
      );
  }
  visit(
    [],
    Array.from({ length }, (_unused, index) => index),
  );
  return result;
}
export function compareResults(
  expected: ExpectedTable,
  observed: ObservedTable,
) {
  if (observed.columns.length !== expected.columns.length)
    return { passed: false, reason: "column-count mismatch" };
  if (observed.rows.length !== expected.rows.length)
    return { passed: false, reason: "row-count mismatch" };
  if (expected.columns.length > 3)
    throw new Error("This small oracle supports at most three output columns.");
  const sortRows = (rows: Cell[][]) =>
    [...rows].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  for (const mapping of permutations(expected.columns.length)) {
    // One global column mapping, never a different interpretation for each row.
    const normalized = observed.rows.map((row) =>
      mapping.map((source, target) =>
        normalize(
          row[source],
          observed.columns[source].type,
          expected.rows[0]?.[target] ?? null,
        ),
      ),
    );
    const want = expected.unordered ? sortRows(expected.rows) : expected.rows;
    const actual = expected.unordered ? sortRows(normalized) : normalized;
    const passed = actual.every((row, index) =>
      row.every((cell, col) => {
        const target = want[index][col];
        return typeof target === "number"
          ? typeof cell === "number" &&
              Number.isFinite(cell) &&
              Math.abs(cell - target) <= expected.tolerance
          : cell === target;
      }),
    );
    if (passed)
      return {
        passed: true,
        reason: "values and shape match",
        columnMapping: mapping,
      };
  }
  return {
    passed: false,
    reason: "values, precision, or required order differ",
  };
}
