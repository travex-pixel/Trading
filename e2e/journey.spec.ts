import { expect, test, type Page } from "@playwright/test";

/**
 * The complete user journey, end to end, against a production build:
 * open → pick a strategy → configure → backtest → read results → compare →
 * save an experiment → enter a competition → paper trade → review the journal.
 */

async function expectNoDemoLeak(page: Page) {
  // Demo data must be labelled wherever market data appears.
  await expect(page.getByText(/DEMO DATA/i).first()).toBeVisible();
}

test("full research journey", async ({ page }) => {
  // 1. Open the application.
  await page.goto("/");
  await expect(page).toHaveTitle(/EdgeLab/);
  await expectNoDemoLeak(page);

  // 2. Start a sample strategy from the library.
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Strategy Lab" })).toBeVisible();
  await page.getByRole("link", { name: /Moving average crossover/ }).click();
  await expect(page).toHaveURL(/\/lab\/build\?kind=ma_crossover/);
  await expect(page.getByRole("heading", { name: "MA crossover 20/60" })).toBeVisible({ timeout: 30_000 });

  // 3. Configure its parameters: change the slow period and watch results update.
  const slow = page.getByLabel("Slow period (exact)");
  await slow.fill("80");
  await slow.blur();
  await expect(page.getByText("Total return")).toBeVisible();

  // 4. Run a backtest (it runs on every change) and the full validation.
  await page.getByRole("button", { name: "Run full validation" }).click();
  await expect(page.getByText("Walk-forward test")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Parameter sensitivity")).toBeVisible();

  // 5. View results: the verdict and metrics are present.
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("Is this a real edge?")).toBeVisible();
  await expect(page.getByText("Max drawdown").first()).toBeVisible();
  await page.getByRole("tab", { name: /Trades/ }).click();
  await expect(page.getByRole("columnheader", { name: "Exit reason" })).toBeVisible();

  // 6. Compare strategies.
  await page.getByRole("button", { name: "Compare" }).click();
  await page.goto("/lab/compare");
  await page.getByLabel("Add a library strategy").selectOption("buy_and_hold");
  await expect(page.getByText("Trade-offs in plain English")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Metrics side by side")).toBeVisible();

  // 7. Save an experiment.
  await page.goto("/lab/build?kind=rsi_mean_reversion");
  await expect(page.getByRole("heading", { name: "RSI reversion 14" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save to journal" }).click();
  await page.getByLabel("Hypothesis").fill("Oversold bounces should pay after sharp falls.");
  await page.getByRole("button", { name: "Save experiment" }).click();
  await expect(page.getByText("Saved to the research journal")).toBeVisible();

  // 8. Enter a competition.
  await page.goto("/arena");
  await expect(page.getByRole("heading", { name: "Bot Arena" })).toBeVisible();
  const demo = page.getByRole("button", { name: /demo competition/i });
  if (await demo.count()) {
    await demo.first().click();
  } else {
    await page.getByRole("link", { name: /create competition/i }).first().click();
  }
  await expect(page.getByText(/leaderboard/i).first()).toBeVisible({ timeout: 60_000 });

  // 9. Start paper trading from the Lab.
  await page.goto("/lab/build?kind=tsmom");
  await expect(page.getByRole("heading", { name: "Momentum 90d" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Paper trade" }).click();
  await page.getByRole("button", { name: "Start simulated portfolio" }).click();
  await expect(page).toHaveURL(/\/paper\?id=/);
  await expect(page.getByText("SIMULATED").first()).toBeVisible({ timeout: 30_000 });

  // 10. Review the research journal.
  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Research Journal" })).toBeVisible();
  await expect(page.getByText("RSI reversion 14").first()).toBeVisible();
});

test("shared experiment links validate on decode", async ({ page }) => {
  await page.goto("/s/not-a-real-code!!");
  await expect(page.getByText(/cannot be opened|invalid|malformed/i).first()).toBeVisible();
});

test("market data API validates input and labels demo data", async ({ request }) => {
  const bad = await request.get("/api/market/candles?assets=DOGE&timeframe=4h");
  expect(bad.status()).toBe(400);
  const good = await request.get("/api/market/candles?assets=BTC&timeframe=1d");
  expect(good.ok()).toBeTruthy();
  const json = (await good.json()) as { series: Array<{ source: { isSynthetic: boolean; label: string }; t: number[] }> };
  expect(json.series[0].source.isSynthetic).toBe(true);
  expect(json.series[0].source.label).toContain("DEMO DATA");
  expect(json.series[0].t.length).toBeGreaterThan(1000);
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});
