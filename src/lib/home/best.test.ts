import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { bestStrategyReport, rankLibrary, rankableKinds } from "./best";

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
    const { ranked } = rankLibrary(cba);
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
    expect(r.meaning.headline).toContain("CBA");
    expect(r.meaning.points.length).toBeGreaterThanOrEqual(4);
    expect(r.meaning.caveat.length).toBeGreaterThan(40);
    expect(["unproven", "fragile", "promising", "robust"]).toContain(r.assessment.verdict);
    // The headline never promises the future.
    expect(r.meaning.headline).toMatch(/would have/);
  });

  it("is quick enough to run on every instrument switch", () => {
    const t0 = performance.now();
    bestStrategyReport(cba);
    expect(performance.now() - t0).toBeLessThan(2_000);
  });
});
