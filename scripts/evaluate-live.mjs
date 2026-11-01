import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
// Reproducible reviewer entry point. Refuses fixture mode before spending calls.
const base = process.env.APP_BASE ?? "http://127.0.0.1:5173";
const health = await (await fetch(`${base}/api/health`)).json();
if (health.mode !== "live")
  throw new Error(
    "Run the app against the live Worker first. Fixtures cannot count as model evidence.",
  );
const channel =
  process.env.BROWSER_CHANNEL ??
  (process.platform === "win32" ? "msedge" : undefined);
const browser = await chromium.launch({ channel, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/verify.html`);
  await page
    .getByRole("button", { name: "Run live golden comparison", exact: true })
    .click();
  const reportElement = page.getByTestId("evaluation-report");
  await reportElement.waitFor({ timeout: 20 * 60 * 1000 });
  const report = JSON.parse(await reportElement.innerText());
  await writeFile(
    process.env.EVALUATION_OUTPUT ?? "data/evaluation-latest.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.table(report.summary);
  if (report.rows.some((row) => !row.passed)) process.exitCode = 1;
} finally {
  await browser.close();
}
