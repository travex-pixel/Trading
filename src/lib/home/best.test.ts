import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { analysisPeriod, bestStrategyReport, rankLibrary, rankableKinds } from "./best";

const cba = demoSeries("ASX:CBA", "1d");

describe("best strategy report", () => {
  it("ranks only single-instrument ideas, never benchmarks or the coin flip", () => {
    const kinds = rankableKinds();
    expect(kinds).not.toContain("buy_and_hold");
    expect(kinds).not.toContain("random_baseline");
    expect(kinds).not.toContain("momentum_rotation");
    expect(kinds.length).toBeGreaterThanOrEqual(5);
  });

  it("orders by return per unit of risk and numbers the ranks", () => {
    const { ranked } = rankLibrary(cba, analysisPeriod(cba)!);
    expect(ranked.length).toBeGreaterThanOrEqual(5);
    ranked.forEach((r, i) => expect(r.rank).toBe(i + 1));
    for (let i = 1; i < ranked.length; i++) {
      const prev = ranked[i - 1].score ?? -Infinity;
      const cur = ranked[i].score ?? -Infinity;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it("explains the winner in plain English with its caveats", () => {
    const report = bestStrategyReport(cba);
    expect(report).not.toBeNull();
    const r = report!;
    expect(r.best.rank).toBe(1);
    expect(r.meaning.headline).toContain(r.best.name);
    // Synthetic prices are never described as facts about the real company.
    expect(r.meaning.headline).toContain("demo CBA prices");
    // The period is stated, not "the last 24 months".
    expect(r.meaning.headline).toMatch(/^From \d{2} \w{3} \d{4} to \d{2} \w{3} \d{4}/);
    expect(r.meaning.points.length).toBeGreaterThanOrEqual(4);
    expect(r.meaning.caveat.length).toBeGreaterThan(40);
    expect(["unproven", "fragile", "promising", "robust"]).toContain(r.assessment.verdict);
    // Every winner comes with the luck test, the deflated Sharpe ratio and the cross-market evidence.
    expect(r.luck).not.toBeNull();
    expect(r.luck!.pValue).toBeGreaterThan(0);
    expect(r.luck!.pValue).toBeLessThanOrEqual(1);
    expect(r.meaning.luckLine).toMatch(/luck|Borderline/i);
    expect(r.deflatedSharpe).not.toBeNull();
    expect(r.meaning.researchLine).toContain("140 tests");
    expect(r.pickThenTrade).not.toBeNull();
    // The overall verdict never says "promising" while the luck test says luck could explain it.
    if (r.luckVerdict === "luck_explains") expect(r.assessment.verdict).toBe("unproven");
    expect(r.meaning.short).toMatch(/^On demo prices, A\$10,000 became/);
  });

  it("is quick enough to run on every instrument switch", () => {
    const stw = demoSeries("ASX:STW", "1d");
    const t0 = performance.now();
    bestStrategyReport(stw);
    const ms = performance.now() - t0;
    console.log(`best strategy report on STW: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2_000);
  });

  it("uses all history before the paper-trading holdout, not two years", () => {
    const p = analysisPeriod(cba)!;
    expect((p.end - p.start) / (365.25 * 86_400_000)).toBeGreaterThan(4);
  });
});
