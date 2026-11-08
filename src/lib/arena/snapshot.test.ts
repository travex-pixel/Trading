import { describe, expect, it } from "vitest";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { decodeCompetitionSnapshot, encodeCompetitionSnapshot, type CompetitionSnapshot } from "./snapshot";
import { computeStandings, demoCompetition, normaliseToRules, researchCandidateConfig } from "./competition";
import { demoSeries } from "@/lib/market/demo-data";

const snap: CompetitionSnapshot = {
  v: 1,
  name: "Test",
  rules: { assets: ["CRYPTO:BTC"], timeframe: "1d", start: 0, end: 1000, initialCapital: 10_000, feeBps: 10, slippageBps: 5 },
  participants: [{ name: "Buy and hold", kind: "seeded_bot", config: STRATEGY_LIBRARY.buy_and_hold.defaults }],
  data: "demo-v1",
};

describe("competition snapshot codec", () => {
  it("round-trips", () => {
    const code = encodeCompetitionSnapshot(snap);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeCompetitionSnapshot(code);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.snapshot).toEqual(snap);
  });
  it("rejects malformed, oversized and invalid payloads", () => {
    expect(decodeCompetitionSnapshot("").ok).toBe(false);
    expect(decodeCompetitionSnapshot("not base64!").ok).toBe(false);
    expect(decodeCompetitionSnapshot("a".repeat(9000)).ok).toBe(false);
    const bad = btoa(JSON.stringify({ v: 1, name: "x", rules: {}, participants: [] })).replace(/=+$/, "");
    expect(decodeCompetitionSnapshot(bad).ok).toBe(false);
  });
});

describe("competition logic", () => {
  it("normalises participants to the shared rules", () => {
    const rules = { assets: ["CRYPTO:ETH", "CRYPTO:BTC"], timeframe: "1d" as const, start: 0, end: 1, initialCapital: 500, feeBps: 25, slippageBps: 7 };
    const n = normaliseToRules(STRATEGY_LIBRARY.ma_crossover.defaults, rules);
    expect(n.assets).toEqual(["CRYPTO:ETH"]);
    expect(n.timeframe).toBe("1d");
    expect(n.initialCapital).toBe(500);
    expect(n.costs).toEqual({ feeBps: 25, slippageBps: 7, feeFixed: 0 });
    const r = normaliseToRules(STRATEGY_LIBRARY.momentum_rotation.defaults, rules);
    expect(r.assets).toEqual(["CRYPTO:ETH", "CRYPTO:BTC"]);
  });
  it("research candidate is deterministic and valid", () => {
    const a = researchCandidateConfig("x");
    const b = researchCandidateConfig("x");
    expect(a).toEqual(b);
    if (a.params.kind === "ma_crossover") expect(a.params.fast).toBeLessThan(a.params.slow);
  });
  it("ranks every participant under identical conditions", () => {
    const btc = demoSeries("CRYPTO:BTC", "1d");
    const eth = demoSeries("CRYPTO:ETH", "1d");
    const comp = demoCompetition(btc.candles[0].time, btc.candles[btc.candles.length - 1].time, "CRYPTO");
    const standings = computeStandings(comp, [btc, eth]);
    expect(standings.length).toBe(comp.participants.length);
    expect(standings.map((s) => s.rank)).toEqual(standings.map((_, i) => i + 1));
    for (const s of standings) {
      expect(s.result).not.toBeNull();
      expect(s.result!.assumptions.initialCapital).toBe(comp.rules.initialCapital);
      expect(s.result!.period.start).toBe(standings[0].result!.period.start);
    }
    for (let i = 1; i < standings.length; i++) {
      const a = standings[i - 1].score;
      const b = standings[i].score;
      if (a !== null && b !== null) expect(a).toBeGreaterThanOrEqual(b);
    }
  });
});
