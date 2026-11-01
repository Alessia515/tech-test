import { useState } from "react";
import { runMetricsEvaluation } from "./evaluate-metrics";
import type { MetricEvalRow } from "./evaluate-metrics";
export function MetricsWorkbench() {
  const [status, setStatus] = useState(
    "Ready. This bounded comparison makes 33 live model requests.",
  );
  const [busy, setBusy] = useState(false),
    [rows, setRows] = useState<MetricEvalRow[]>([]);
  const [report, setReport] = useState<Awaited<
    ReturnType<typeof runMetricsEvaluation>
  > | null>(null);
  async function run() {
    setBusy(true);
    setRows([]);
    setReport(null);
    try {
      setReport(
        await runMetricsEvaluation(setStatus, (row) =>
          setRows((previous) => [...previous, row]),
        ),
      );
      setStatus("Semantic comparison complete. First attempts preserved.");
    } catch (error) {
      setStatus(`Stopped: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Defined metrics comparison</h2>
      <p>
        Eight compiler preflight queries, then fifteen paired questions and
        three metrics-only attacks. Accuracy, coverage and refusals are scored
        separately.
      </p>
      <button disabled={busy} onClick={run}>
        Run semantic comparison
      </button>
      <p role="status">{status}</p>
      <table>
        <thead>
          <tr>
            <th>Case</th>
            <th>Mode</th>
            <th>Result</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.id}-${row.mode}`}>
              <td>{row.id}</td>
              <td>{row.mode}</td>
              <td>{row.passed ? "PASS" : "FAIL"}</td>
              <td>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report && (
        <pre data-testid="metrics-report">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </section>
  );
}
