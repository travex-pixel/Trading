import { expect, test, type Page } from "@playwright/test";

/**
 * The complete user journey, end to end, against a production build:
 * open → pick a strategy → configure → backtest → read results → compare →
 * save an experiment → enter a competition → paper trade → review the journal.
 */

async function expectNoDemoLeak(page: Page) {
  // Demo data must be labelled wherever market data appears.
  await expect(
    page
      .getByText(/DEMO DATA/i)
      .locator("visible=true")
      .first(),
  ).toBeVisible();
}

test("full research journey", async ({ page }) => {
  // 1. Open the application.
  await page.goto("/");
  await expect(page).toHaveTitle(/EdgeLab/);
  await expectNoDemoLeak(page);

  // 2. Start a sample strategy from the library.
  await page.goto("/lab");
  await expect(
    page.getByRole("heading", { name: "Strategy Lab" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Moving average crossover/ }).click();
  await expect(page).toHaveURL(/\/lab\/build\?kind=ma_crossover/);
  await expect(
    page.getByRole("heading", { name: "MA crossover 20/60" }),
  ).toBeVisible({ timeout: 30_000 });

  // 3. Configure its parameters: change the slow period and watch results update.
  const slow = page.getByLabel("Slow period (exact)");
  await slow.fill("80");
  await slow.blur();
  await expect(page.getByText("Total return").first()).toBeVisible();

  // 4. Run a backtest (it runs on every change) and the full validation.
  await page.getByRole("button", { name: "Run full validation" }).click();
  await expect(page.getByText("Walk-forward test")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Parameter sensitivity")).toBeVisible();

  // 5. View results: the verdict and metrics are present.
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("Is this a real edge?")).toBeVisible();
  await expect(page.getByText("Max drawdown").first()).toBeVisible();
  await page.getByRole("tab", { name: /Trades/ }).click();
  await expect(
    page.getByRole("columnheader", { name: "Exit reason" }),
  ).toBeVisible();

  // 6. Compare strategies.
  await page.getByRole("button", { name: "Compare" }).click();
  await page.goto("/lab/compare");
  await page.getByLabel("Add a library strategy").selectOption("buy_and_hold");
  await expect(page.getByText("Trade-offs in plain English")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Metrics side by side")).toBeVisible();

  // 7. Save an experiment.
  await page.goto("/lab/build?kind=rsi_mean_reversion");
  await expect(
    page.getByRole("heading", { name: "RSI reversion 14" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save to journal" }).click();
  await page
    .getByLabel("Hypothesis")
    .fill("Oversold bounces should pay after sharp falls.");
  await page.getByRole("button", { name: "Save experiment" }).click();
  await expect(page.getByText("Saved to the research journal")).toBeVisible();

  // 8. Enter a competition.
  await page.goto("/arena");
  await expect(page.getByRole("heading", { name: "Bot Arena" })).toBeVisible();
  const demo = page.getByRole("button", { name: /demo competition/i });
  const create = page.getByRole("link", { name: /create competition/i });
  // The list is read from browser storage after hydration; wait for either entry point.
  await expect(demo.or(create).first()).toBeVisible({ timeout: 20_000 });
  if (await demo.count()) {
    await demo.first().click();
  } else {
    await create.first().click();
    await expect(
      page.getByRole("heading", { name: "Create a competition" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create competition" }).click();
  }
  await expect(page.getByText(/leaderboard/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // 9. Start paper trading from the Lab.
  await page.goto("/lab/build?kind=tsmom");
  await expect(page.getByRole("heading", { name: "Momentum 90d" })).toBeVisible(
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Paper trade" }).click();
  await page.getByRole("button", { name: "Start simulated portfolio" }).click();
  await expect(page).toHaveURL(/\/paper\?id=/);
  await expect(page.getByText("SIMULATED").first()).toBeVisible({
    timeout: 30_000,
  });

  // 10. Review the research journal.
  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "Research Journal" }),
  ).toBeVisible();
  await expect(page.getByText("RSI reversion 14").first()).toBeVisible();
});

test("today's five can be played to a score and resumes as completed", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('main a[href="/daily"]').first().click();
  await expect(page).toHaveURL(/\/daily/);
  await page.getByRole("button", { name: /Play/ }).click();
  for (let i = 0; i < 5; i++) {
    const choices = page
      .getByRole("group", { name: "Answers" })
      .getByRole("button");
    await choices.first().click();
    const next = page.getByRole("button", {
      name: /Next question|See my score/,
    });
    await expect(next).toBeVisible();
    await next.click();
  }
  await expect(page.getByText(/\/ 5/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Share your score/ }),
  ).toBeVisible();
  // Reloading shows the score, not the intro, and the home teaser offers a review.
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Review the answers/ }),
  ).toBeVisible({ timeout: 20_000 });
  await page.goto("/");
  await expect(page.locator('main a[href="/daily"]').first()).toContainText(
    "Review",
  );
});

test("ASX is the default market and an instrument can be selected and backtested in AUD", async ({
  page,
}) => {
  await page.goto("/markets");
  await expect(page.getByRole("heading", { name: "Markets" })).toBeVisible();
  await expect(page.getByText("ASX instruments")).toBeVisible();
  await expect(page.getByText("19 supported · AUD")).toBeVisible();
  // Session status and timezone are stated.
  await expect(page.getByText(/Session 10:00–16:00 local/)).toBeVisible({
    timeout: 20_000,
  });
  // Pick BHP from the table and land in the Lab with it selected.
  await page.getByRole("link", { name: /BHP/ }).first().click();
  await expect(page).toHaveURL(/asset=ASX%3ABHP/);
  await expect(page.getByText("BHP Group").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("Australian Securities Exchange").first(),
  ).toBeVisible();
  // Results are in AUD with a flat brokerage in the provenance plate.
  await expect(page.getByText(/ASX · AUD/).first()).toBeVisible();
  await expect(page.getByText(/10 AUD \/order/).first()).toBeVisible();
  await expect(page.getByText(/A\$/).first()).toBeVisible();
  // Switch to a different ASX instrument through the picker search.
  await page.getByRole("button", { name: /BHP Group/ }).click();
  await page.getByPlaceholder(/by ticker or name/).fill("CSL");
  await page.getByRole("option", { name: /CSL Limited/ }).click();
  await expect(page.getByText("CSL Limited").first()).toBeVisible();
  // Switch market to US and see USD.
  await page.getByRole("radio", { name: "US" }).first().click();
  await expect(page.getByText(/US\$/).first()).toBeVisible({ timeout: 30_000 });
});

test("shared experiment links validate on decode", async ({ page }) => {
  await page.goto("/s/not-a-real-code!!");
  await expect(
    page.getByText(/cannot be opened|invalid|malformed/i).first(),
  ).toBeVisible();
});

test("market data API validates input and labels demo data", async ({
  request,
}) => {
  const bad = await request.get(
    "/api/market/candles?assets=ASX:DOGE&timeframe=4h",
  );
  expect(bad.status()).toBe(400);
  const good = await request.get(
    "/api/market/candles?assets=ASX:CBA&timeframe=1d",
  );
  expect(good.ok()).toBeTruthy();
  const json = (await good.json()) as {
    series: Array<{
      market: string;
      currency: string;
      source: { isSynthetic: boolean; label: string; freshness: string };
      t: number[];
    }>;
  };
  expect(json.series[0].market).toBe("ASX");
  expect(json.series[0].currency).toBe("AUD");
  expect(json.series[0].source.isSynthetic).toBe(true);
  expect(json.series[0].source.freshness).toBe("simulated");
  expect(json.series[0].source.label).toContain("DEMO DATA");
  expect(json.series[0].t.length).toBeGreaterThan(1000);
  const status = await request.get("/api/market/status");
  expect(status.ok()).toBeTruthy();
  const st = (await status.json()) as {
    markets: Array<{
      id: string;
      status: string;
      data: { isSynthetic: boolean };
    }>;
  };
  expect(st.markets.map((m) => m.id)).toEqual(["ASX", "US", "CRYPTO"]);
  const quotes = await request.get("/api/market/quotes?ids=ASX:CBA");
  expect(quotes.ok()).toBeTruthy();
  expect(((await quotes.json()) as { quotes: unknown[] }).quotes).toEqual([]);
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});

test("link previews carry an absolute, crisp Open Graph image", async ({
  request,
}) => {
  // WhatsApp and Messenger need absolute image URLs with declared dimensions,
  // and WhatsApp drops to a tiny icon above roughly 300 KB.
  const html = await (await request.get("/")).text();
  const image = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
  expect(image).toMatch(/^https?:\/\//);
  expect(html).toContain('property="og:image:width" content="1200"');
  expect(html).toContain('property="og:image:height" content="630"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  const res = await request.get(
    new URL(image!).pathname + new URL(image!).search,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const bytes = await res.body();
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(bytes.length).toBeLessThan(300_000);
  // PNG header: width and height are big-endian at offsets 16 and 20.
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);

  // A shared experiment gets its own card and a specific title.
  const config = {
    v: 1,
    name: "MA crossover 20/60",
    assets: ["ASX:BHP"],
    timeframe: "1d",
    params: { kind: "ma_crossover", fast: 20, slow: 60, maType: "ema" },
    risk: {
      stopLossPct: null,
      takeProfitPct: null,
      sizing: { mode: "fixed_fraction", fraction: 1 },
      maxPositions: 1,
    },
    costs: { feeBps: 0, slippageBps: 5, feeFixed: 10 },
    initialCapital: 10000,
  };
  const code = Buffer.from(
    JSON.stringify({
      v: 1,
      config,
      start: Date.UTC(2023, 9, 2),
      end: Date.UTC(2025, 9, 1),
      data: "demo-v2",
      title: "Beat my BHP crossover",
    }),
  ).toString("base64url");
  const shared = await (await request.get(`/s/${code}`)).text();
  expect(shared).toContain(
    'property="og:title" content="Beat my BHP crossover · EdgeLab"',
  );
  const card = await request.get(`/s/${code}/opengraph-image`);
  expect(card.status()).toBe(200);
  expect((await card.body()).length).toBeLessThan(300_000);
});
