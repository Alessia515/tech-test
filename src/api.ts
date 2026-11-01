import type { MetricPlan } from "../shared/metrics.ts";
import { parsePlan } from "../shared/metrics.ts";
export type GenerationMode = "sql" | "metrics";
export type ApiHealth = {
  mode: "live" | "fixture";
  model: string | null;
  aiBinding: boolean;
  fixtureQuestions: string[];
};
export type Proposal = {
  mode: "live" | "fixture";
  model: string | null;
  sql: string;
  executableSql: string;
  rationale: string;
  contextMode: "retrieved" | "none" | "catalog";
  generationMode?: GenerationMode;
  plan?: MetricPlan;
  definition?: string;
  snippets: { id: string; text: string; score: number }[];
};
export class ApiRequestError extends Error {
  proposal?: { sql: string; rationale: string };
  constructor(message: string, proposal?: { sql: string; rationale: string }) {
    super(message);
    this.name = "ApiRequestError";
    this.proposal = proposal;
  }
}
export function createApi(fetcher: typeof fetch = fetch) {
  async function read(response: Response): Promise<Record<string, any>> {
    let body;
    try {
      body = await response.json();
    } catch {
      throw new ApiRequestError(
        "The API returned an unreadable response. Check that the Worker is running.",
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApiRequestError("The API returned an invalid response.");
    if (!response.ok)
      throw new ApiRequestError(
        typeof body.error?.message === "string"
          ? body.error.message
          : `API request failed (${response.status}).`,
        typeof body.proposal?.sql === "string"
          ? {
              sql: body.proposal.sql,
              rationale: String(body.proposal.rationale ?? ""),
            }
          : undefined,
      );
    return body;
  }
  return {
    async health(signal?: AbortSignal): Promise<ApiHealth> {
      const body = await read(await fetcher("/api/health", { signal }));
      if (
        !["live", "fixture"].includes(body.mode) ||
        !Array.isArray(body.fixtureQuestions)
      )
        throw new ApiRequestError("The API did not identify its mode.");
      return body as ApiHealth;
    },
    async generate(
      question: string,
      signal?: AbortSignal,
      generationMode: GenerationMode = "sql",
    ): Promise<Proposal> {
      // No SQL, data, results, or browser-schema parameters exist here.
      const body = await read(
        await fetcher(
          generationMode === "metrics" ? "/api/metrics" : "/api/generate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify(
              generationMode === "metrics"
                ? { question }
                : { question, contextMode: "retrieved" },
            ),
          },
        ),
      );
      if (
        !["live", "fixture"].includes(body.mode) ||
        typeof body.sql !== "string" ||
        typeof body.rationale !== "string" ||
        !Array.isArray(body.snippets)
      )
        throw new ApiRequestError(
          "The API returned an incomplete SQL proposal.",
        );
      if (generationMode === "metrics") {
        if (
          body.generationMode !== "metrics" ||
          typeof body.definition !== "string"
        )
          throw new ApiRequestError(
            "The API returned an incomplete metric proposal.",
          );
        try {
          parsePlan(body.plan);
        } catch {
          throw new ApiRequestError("The API returned an invalid metric plan.");
        }
      }
      return body as Proposal;
    },
  };
}
