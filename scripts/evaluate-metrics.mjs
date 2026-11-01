import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
// Optional reviewer command: 33 live calls, not part of pnpm test.
const base = process.env.APP_BASE ?? "http://127.0.0.1:5173";
const health = await (await fetch(`${base}/api/health`)).json();
if (health.mode !== "live")
  throw Error(
    "Live Worker required; fixture responses are not model evidence.",
  );
const browser = await chromium.launch({
  channel:
    process.env.BROWSER_CHANNEL ??
    (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`${base}/verify.html`);
  await page
    .getByRole("button", { name: "Run semantic comparison", exact: true })
    .click();
  const element = page.getByTestId("metrics-report");
  await element.waitFor({ timeout: 20 * 60 * 1000 });
  const report = JSON.parse(await element.innerText());
  await writeFile(
    process.env.EVALUATION_OUTPUT ?? "data/semantic-latest.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.table(report.summary);
  if (report.rows.some((r) => r.mode === "metrics" && !r.passed))
    process.exitCode = 1;
} finally {
  await browser.close();
}
