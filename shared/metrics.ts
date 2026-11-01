// The model selects identifiers; only this module supplies SQL expressions.
export const metrics = {
  trip_count: {
    label: "Trip count",
    definition:
      "Number of January pickups, including anomalous recorded values.",
    sql: "COUNT(*)",
    alias: "trips",
  },
  metered_fare: {
    label: "Total metered fare",
    definition:
      "Sum of fare_amount in dollars, including negative adjustments; excludes extras and tips.",
    sql: "SUM(fare_amount)",
    alias: "fare_dollars",
  },
  avg_distance: {
    label: "Average recorded distance",
    definition:
      "Average recorded trip_distance in miles, including zero and anomalous values.",
    sql: "AVG(trip_distance)",
    alias: "average_miles",
  },
  card_tip_percentage: {
    label: "Card tip percentage",
    definition:
      "100 × SUM(tip_amount) / SUM(fare_amount), for credit-card trips with positive fares. Cash tips are not recorded.",
    sql: "100.0 * SUM(tip_amount) / NULLIF(SUM(fare_amount), 0)",
    alias: "tip_percent",
  },
} as const;
export const dimensions = {
  none: null,
  day: {
    sql: "CAST(CAST(tpep_pickup_datetime AS DATE) AS VARCHAR)",
    alias: "day",
  },
  hour: {
    sql: "CAST(EXTRACT(HOUR FROM tpep_pickup_datetime) AS INTEGER)",
    alias: "hour",
  },
  pickup_zone: { sql: "PULocationID", alias: "zone_id" },
} as const;
export const filters = {
  all: "",
  card: "payment_type = 1",
  cash: "payment_type = 2",
  long_distance: "trip_distance > 10",
} as const;
export type MetricPlan = {
  metric: keyof typeof metrics | null;
  dimension: keyof typeof dimensions;
  filter: keyof typeof filters;
  order: "natural" | "top5";
  rationale: string;
};
export const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    metric: { type: ["string", "null"], enum: [...Object.keys(metrics), null] },
    dimension: { type: "string", enum: Object.keys(dimensions) },
    filter: { type: "string", enum: Object.keys(filters) },
    order: { type: "string", enum: ["natural", "top5"] },
    rationale: { type: "string" },
  },
  required: ["metric", "dimension", "filter", "order", "rationale"],
};
export class PlanError extends Error {}
export function parsePlan(value: unknown): MetricPlan {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PlanError("Plan must be an object.");
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).length !== 5 ||
    Object.keys(p).some(
      (k) =>
        !["metric", "dimension", "filter", "order", "rationale"].includes(k),
    ) ||
    !(
      p.metric === null ||
      (typeof p.metric === "string" && Object.keys(metrics).includes(p.metric))
    ) ||
    typeof p.dimension !== "string" ||
    !Object.keys(dimensions).includes(p.dimension) ||
    typeof p.filter !== "string" ||
    !Object.keys(filters).includes(p.filter) ||
    !["natural", "top5"].includes(String(p.order)) ||
    typeof p.order !== "string" ||
    typeof p.rationale !== "string" ||
    !p.rationale.trim() ||
    p.rationale.length > 300
  )
    throw new PlanError("Plan contains missing, unknown, or invalid choices.");
  if (
    p.metric === null &&
    (p.dimension !== "none" || p.filter !== "all" || p.order !== "natural")
  )
    throw new PlanError("A refusal must use the neutral plan.");
  if (p.order === "top5" && p.dimension === "none")
    throw new PlanError("Top five requires a dimension.");
  if (p.metric === "card_tip_percentage" && p.filter === "cash")
    throw new PlanError(
      "Card tip percentage cannot be filtered to cash payments.",
    );
  return p as MetricPlan;
}
export function compilePlan(value: unknown): {
  plan: MetricPlan;
  sql: string | null;
  definition: string;
} {
  const plan = parsePlan(value);
  if (plan.metric === null)
    return { plan, sql: null, definition: plan.rationale };
  const m = metrics[plan.metric],
    d = dimensions[plan.dimension];
  const clauses = [
    "tpep_pickup_datetime >= TIMESTAMP '2024-01-01'",
    "tpep_pickup_datetime < TIMESTAMP '2024-02-01'",
  ];
  if (filters[plan.filter]) clauses.push(filters[plan.filter]);
  if (plan.metric === "card_tip_percentage") {
    if (plan.filter !== "card") clauses.push("payment_type = 1");
    clauses.push("fare_amount > 0");
  }
  const sql = `SELECT ${d ? `${d.sql} AS ${d.alias}, ` : ""}${m.sql} AS ${m.alias} FROM trips WHERE ${clauses.join(" AND ")}${d ? ` GROUP BY 1 ORDER BY ${plan.order === "top5" ? `${m.alias} DESC, ${d.alias} ASC LIMIT 5` : `${d.alias} ASC`}` : ""}`;
  return {
    plan,
    sql,
    definition: `${m.label}: ${m.definition} Period: January 2024 pickups. Group: ${plan.dimension}. Filter: ${plan.filter}. Order: ${plan.order}.`,
  };
}
