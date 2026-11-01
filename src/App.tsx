import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createApi, ApiRequestError } from "./api";
import type { ApiHealth, Proposal, GenerationMode } from "./api";
import { useDatabase } from "./use-database";
import { displayTable, Results } from "./results";
import type { DisplayResult } from "./results";
import { SQL_MAX_LENGTH } from "./sql-validator";
const api = createApi();
const examples = [
  "How many trips had pickups in January 2024?",
  "What was the average recorded trip distance in January?",
  "How many January trips were paid by credit card?",
  "What was the total metered fare in January?",
  "What were the five busiest pickup zone IDs in January?",
];
export default function App() {
  const database = useDatabase();
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [apiError, setApiError] = useState("");
  const [question, setQuestion] = useState(examples[0]);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("sql");
  const [sql, setSql] = useState("");
  const [proposal, setProposal] = useState<
    (Proposal & { question: string }) | null
  >(null);
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"generating" | "querying" | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const operation = useRef(0),
    mounted = useRef(true);
  async function refreshHealth(signal?: AbortSignal) {
    setApiError("");
    try {
      const next = await api.health(signal);
      if (mounted.current) setHealth(next);
    } catch (error) {
      if (mounted.current && !signal?.aborted) {
        setHealth(null);
        setApiError(
          error instanceof Error ? error.message : "Cannot reach the API.",
        );
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refreshHealth(controller.signal);
    return () => {
      mounted.current = false;
      operation.current++;
      controller.abort();
      requestController.current?.abort();
    };
  }, []);
  const edited = Boolean(sql && (!proposal || sql !== proposal.sql));
  async function execute(
    text: string,
    source: DisplayResult["source"],
    label: string,
    current: number,
  ) {
    const session = database.session.current;
    if (!session || session.runner.closed)
      throw new Error("Reload the dataset before running SQL.");
    setBusy("querying");
    setResult(null);
    const started = performance.now();
    try {
      const response = await session.runner.run(text);
      if (mounted.current && operation.current === current)
        setResult({
          ...displayTable(response.table),
          executableSql: response.executionSql,
          truncated: response.truncated,
          elapsedMs: Math.round(performance.now() - started),
          source,
          question: label,
        });
    } finally {
      if (mounted.current && session.runner.closed) database.markClosed();
    }
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const current = ++operation.current,
      controller = new AbortController();
    requestController.current = controller;
    const timer = setTimeout(() => controller.abort(), 35_000);
    setBusy("generating");
    setError("");
    setResult(null);
    setProposal(null);
    setSql("");
    try {
      const answer = await api.generate(
        question.trim(),
        controller.signal,
        generationMode,
      );
      clearTimeout(timer);
      requestController.current = null;
      if (!mounted.current || operation.current !== current) return;
      const next = { ...answer, question: question.trim() };
      setProposal(next);
      setSql(answer.sql);
      await execute(answer.sql, answer.mode, next.question, current);
    } catch (error) {
      if (mounted.current && operation.current === current) {
        if (error instanceof ApiRequestError && error.proposal)
          setSql(error.proposal.sql);
        setError(
          controller.signal.aborted
            ? "Generation was cancelled or exceeded 35 seconds. No local query was run."
            : error instanceof Error
              ? error.message
              : String(error),
        );
      }
    } finally {
      clearTimeout(timer);
      if (operation.current === current) {
        requestController.current = null;
        if (mounted.current) setBusy(null);
      }
    }
  }
  async function runEdited() {
    if (busy) return;
    const current = ++operation.current;
    setError("");
    try {
      await execute(
        sql,
        edited ? "edited" : (proposal?.mode ?? "edited"),
        edited ? "Your edited SQL" : (proposal?.question ?? "Your SQL"),
        current,
      );
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }
  function cancel() {
    if (busy === "generating") requestController.current?.abort();
    else if (busy === "querying") {
      database.session.current?.runner.close();
      database.markClosed();
    }
  }
  return (
    <main>
      <header className="page-header">
        <div>
          <p className="eyebrow">NYC TAXI DATA · JANUARY 2024</p>
          <h1>Talk to Your Data</h1>
          <p className="intro">
            Ask a question. Inspect the SQL. Explore the answer.
          </p>
        </div>
        <span
          className={`badge mode ${health?.mode === "fixture" ? "fixture" : ""}`}
        >
          {health
            ? health.mode === "live"
              ? "Live AI"
              : "Fixture · canned SQL"
            : "API not connected"}
        </span>
      </header>
      <div className="dataset-status">
        <span className={`dot ${database.state === "ready" ? "ready" : ""}`} />
        <p role="status">{database.status}</p>
        {database.state !== "loading" && (
          <button
            type="button"
            className="link-button"
            disabled={Boolean(busy)}
            onClick={() => {
              setResult(null);
              void database.reload();
            }}
          >
            Reload dataset
          </button>
        )}
      </div>
      {apiError && (
        <div className="notice error" role="alert">
          <span>
            Cannot reach the generation API: {apiError} Start the Worker, then
            retry. You can still write SQL below.
          </span>
          <button className="secondary" onClick={() => void refreshHealth()}>
            Retry API connection
          </button>
        </div>
      )}
      <section className="panel" aria-labelledby="question-heading">
        <h2 id="question-heading">Ask about the trips</h2>
        <form onSubmit={ask}>
          <label htmlFor="generation-mode">Question mode</label>
          <select
            id="generation-mode"
            value={generationMode}
            disabled={Boolean(busy)}
            onChange={(event) =>
              setGenerationMode(event.target.value as GenerationMode)
            }
          >
            <option value="sql">Flexible SQL</option>
            <option value="metrics">Defined metrics</option>
          </select>
          <p className="muted">
            {generationMode === "metrics"
              ? "Four defined metrics: trip count, total metered fare, average distance, and card tip percentage. Group by day, hour, or pickup zone. January 2024 only; other requests may be declined."
              : "Ask broader questions using generated SQL and retrieved dataset notes."}
          </p>
          <label htmlFor="question">Your question</label>
          <textarea
            id="question"
            rows={2}
            maxLength={1000}
            value={question}
            disabled={Boolean(busy)}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="For example, how many trips were paid by card?"
          />
          <div className="action-row">
            <p className="privacy">
              Trip rows and results stay in your browser. Only your question and
              dataset documentation go to the model. Please don’t paste raw
              rows.
            </p>
            <button
              type="submit"
              disabled={
                Boolean(busy) ||
                database.state !== "ready" ||
                !health ||
                !question.trim()
              }
            >
              {busy === "generating" ? "Generating SQL…" : "Ask & run"}
            </button>
          </div>
        </form>
        <details className="examples">
          <summary>Try an example question</summary>
          <div className="example-list">
            {(health?.mode === "fixture"
              ? health.fixtureQuestions
              : examples
            ).map((text) => (
              <button
                type="button"
                className="example"
                disabled={Boolean(busy)}
                key={text}
                onClick={() => setQuestion(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </details>
        {health?.mode === "fixture" && (
          <p className="notice">
            Fixture mode supports the five exact examples above. These are
            canned SQL responses; no model is called.
          </p>
        )}
      </section>
      <section className="panel" aria-labelledby="sql-heading">
        <div className="section-heading">
          <h2 id="sql-heading">SQL workspace</h2>
          <span className="muted">Read-only query subset</span>
        </div>
        {proposal && (
          <>
            <p className="proposal-question">
              SQL proposed for: {proposal.question}
            </p>
            <p className="rationale">
              {edited
                ? proposal.generationMode === "metrics"
                  ? "You edited this SQL. The defined calculation no longer applies; the read-only SQL checks still run."
                  : "You edited this SQL. The original AI rationale may no longer apply."
                : proposal.rationale}
            </p>
            {proposal.definition && (
              <div className="notice">
                <strong>
                  {edited
                    ? "Original metric definition"
                    : "Defined calculation"}
                </strong>
                <p>{proposal.definition}</p>
                <p>
                  Check that these choices match your question. The model can
                  still choose the wrong metric.
                </p>
              </div>
            )}
          </>
        )}
        <label htmlFor="sql">Editable SQL</label>
        <textarea
          className="sql-editor"
          id="sql"
          rows={7}
          spellCheck={false}
          maxLength={SQL_MAX_LENGTH}
          value={sql}
          disabled={Boolean(busy)}
          onChange={(event) => {
            setSql(event.target.value);
            setResult(null);
            setError("");
          }}
          placeholder="Generated SQL appears here. You can also write a SELECT query against trips."
        />
        <div className="action-row">
          <p className="muted">
            Validated before every run · up to 500 result rows · 10-second query
            limit
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => void runEdited()}
            disabled={
              Boolean(busy) || database.state !== "ready" || !sql.trim()
            }
          >
            Run SQL locally
          </button>
        </div>
        {proposal?.snippets.length ? (
          <details>
            <summary>
              Dataset context used · {proposal.snippets.length}{" "}
              {proposal.snippets.length === 1 ? "note" : "notes"}
            </summary>
            <ul className="context-list">
              {proposal.snippets.map((item) => (
                <li key={item.id}>
                  <strong>{item.id}</strong>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {proposal?.model && (
          <p className="model-label">Model: {proposal.model}</p>
        )}
      </section>
      {busy && (
        <div className="working" role="status">
          <span className="spinner" />
          {busy === "generating"
            ? "Generating SQL from your question and dataset notes…"
            : "Validating and querying locally…"}
          <button className="link-button" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {result ? (
        <Results result={result} />
      ) : (
        !busy &&
        !error && (
          <div className="empty">
            Your results will appear here after a query runs.
          </div>
        )
      )}
      <footer>
        Source:{" "}
        <a
          href="https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page"
          target="_blank"
          rel="noreferrer"
        >
          NYC Taxi &amp; Limousine Commission
        </a>
        . Recorded fares and distances may contain anomalies.
      </footer>
    </main>
  );
}
