import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, ApiRequestError } from "../src/api.ts";
test("browser generation sends only question and context mode, never SQL/data/results", async () => {
  let sent: RequestInit | undefined;
  const api = createApi(async (url, options) => {
    assert.equal(url, "/api/generate");
    sent = options;
    return Response.json({
      mode: "live",
      model: "example",
      sql: "SELECT count(*) FROM trips",
      executableSql: "example",
      rationale: "Counts trips",
      contextMode: "retrieved",
      snippets: [],
    });
  });
  await api.generate("Count trips");
  assert.deepEqual(JSON.parse(String(sent?.body)), {
    question: "Count trips",
    contextMode: "retrieved",
  });
});
test("client preserves a rejected proposal for inspection, without treating it as success", async () => {
  const api = createApi(async () =>
    Response.json(
      {
        error: { message: "Only SELECT queries are allowed." },
        proposal: { sql: "DROP TABLE trips", rationale: "Wrong" },
      },
      { status: 422 },
    ),
  );
  await assert.rejects(
    api.generate("Drop table"),
    (error) =>
      error instanceof ApiRequestError &&
      error.proposal?.sql === "DROP TABLE trips",
  );
});
test("HTML/malformed responses produce a readable API error", async () => {
  const api = createApi(async () => new Response("<html>not an API</html>"));
  await assert.rejects(api.health(), /unreadable response/);
});
test("unidentified response provenance is rejected", async () => {
  const api = createApi(async () =>
    Response.json({
      mode: "mystery",
      sql: "SELECT * FROM trips",
      rationale: "test",
      snippets: [],
    }),
  );
  await assert.rejects(api.generate("Count trips"), /incomplete SQL proposal/);
});
