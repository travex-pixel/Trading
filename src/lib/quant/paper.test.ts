import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { computePaperState, type PaperPortfolio } from "./paper";

const series = [demoSeries("ASX:CBA", "1d")];
const candles = series[0].candles;

function portfolio(partial: Partial<PaperPortfolio>): PaperPortfolio {
  const start = candles[Math.floor(candles.length * 0.5)].time;
  return {
    id: "p1",
    name: "Test",
    config: { ...STRATEGY_LIBRARY.buy_and_hold.defaults },
    startedAt: start,
    clock: candles[Math.floor(candles.length * 0.7)].time,
    status: "running",
    stoppedAt: null,
    createdAt: 0,
    dataVersion: "demo-v3",
    ...partial,
  };
}

describe("paper trading", () => {
  it("keeps a running position open and marks it, with realised plus unrealised equal to the change in the account", () => {
    const s = computePaperState(portfolio({}), series);
    expect(s.positions).toHaveLength(1);
    expect(s.closedTrades).toHaveLength(0);
    const p = s.positions[0];
    const mark = candles
      .filter((c) => c.time <= portfolio({}).clock)
      .at(-1)!.close;
    expect(p.markPrice).toBe(mark);
    expect(s.realisedPnl + s.unrealisedPnl).toBeCloseTo(s.equity - 10_000, 6);
    // The opening order shows the exact brokerage paid, not half of a round trip.
    const buy = s.orders.find((o) => o.side === "buy")!;
    expect(buy.fee).toBeCloseTo(10, 6);
    expect(s.orders.filter((o) => o.side === "sell")).toHaveLength(0);
  });

  it("closes out a stopped portfolio, paying the exit costs", () => {
    const stoppedAt = candles[Math.floor(candles.length * 0.7)].time;
    const s = computePaperState(
      portfolio({ status: "stopped", stoppedAt }),
      series,
    );
    expect(s.positions).toHaveLength(0);
    expect(s.closedTrades).toHaveLength(1);
    expect(s.cash).toBeCloseTo(s.equity, 6);
    expect(s.realisedPnl).toBeCloseTo(s.equity - 10_000, 6);
    const sell = s.orders.find((o) => o.side === "sell")!;
    expect(sell.fee).toBeGreaterThanOrEqual(10);
  });

  it("reports the stop the engine actually holds after trailing", () => {
    const config = { ...STRATEGY_LIBRARY.trend_following.defaults };
    let checked = 0;
    for (let k = 0.55; k < 0.95; k += 0.02) {
      const s = computePaperState(
        portfolio({
          config,
          clock: candles[Math.floor(candles.length * k)].time,
        }),
        series,
      );
      for (const p of s.positions) {
        // Trend following always holds a stop, including on the bar it entered.
        expect(p.stopPrice).not.toBeNull();
        expect(p.stopPrice!).toBeLessThan(p.entryPrice * 1.5);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
