import type { PlateCell } from "./card";
import type { CompetitionSnapshot } from "@/lib/arena/snapshot";
import { fmtDate } from "@/lib/format";
import { MARKETS, getInstrument, marketOf } from "@/lib/market/instruments";
import type { Snapshot } from "@/lib/store/snapshot";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import type { StrategyConfig } from "@/lib/strategies/schema";

/**
 * Plain-English descriptions of shared links for preview cards and page
 * metadata. Configuration only, never results: a recipient's browser re-runs
 * the backtest, so a preview must not promise numbers it did not compute.
 */

export type ShareDescription = {
  title: string;
  subtitle: string;
  plate: PlateCell[];
};

function instrumentsLine(assets: string[]): string {
  return assets
    .map((id) => {
      const inst = getInstrument(id);
      return inst ? inst.symbol : (id.split(":")[1] ?? id);
    })
    .join(" + ");
}

function costsLine(costs: StrategyConfig["costs"], currency: string): string {
  const flat = costs.feeFixed ? `${costs.feeFixed} ${currency}/order · ` : "";
  return `${flat}${costs.feeBps}bp fee · ${costs.slippageBps}bp slip`.replace(
    " · 0bp fee",
    "",
  );
}

export function describeSharedExperiment(s: Snapshot): ShareDescription {
  const cfg = s.config;
  const market = marketOf(cfg.assets[0]);
  const spec = MARKETS[market];
  const strategyName =
    STRATEGY_LIBRARY[cfg.params.kind]?.name ?? cfg.params.kind;
  const title = s.title ?? cfg.name;
  const instruments = instrumentsLine(cfg.assets);
  return {
    title,
    subtitle: `${strategyName} on ${instruments} (${spec.shortName}), ${cfg.timeframe} bars. Open it and your browser re-runs the backtest, so the numbers are reproduced rather than copied.`,
    plate: [
      {
        label: "Instrument",
        value: `${instruments} · ${spec.shortName} · ${spec.currency} · ${cfg.timeframe}`,
      },
      { label: "Period", value: `${fmtDate(s.start)} – ${fmtDate(s.end)}` },
      { label: "Costs", value: costsLine(cfg.costs, spec.currency) },
      { label: "Fills", value: "next open" },
    ],
  };
}

export function describeSharedCompetition(
  s: CompetitionSnapshot,
): ShareDescription {
  const r = s.rules;
  const market = marketOf(r.assets[0]);
  const spec = MARKETS[market];
  const bots = s.participants.filter((p) => p.kind === "seeded_bot").length;
  const people = s.participants.length - bots;
  const who = [
    people ? `${people} ${people === 1 ? "person" : "people"}` : "",
    bots ? `${bots} seeded ${bots === 1 ? "bot" : "bots"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const flat = r.feeFixed ? `${r.feeFixed} ${spec.currency}/order · ` : "";
  return {
    title: s.name,
    subtitle: `${s.participants.length} competitors (${who}) trade ${instrumentsLine(r.assets)} on the ${spec.shortName} under identical rules. Open it to see the board and enter your own strategy.`,
    plate: [
      {
        label: "Market",
        value: `${spec.shortName} · ${spec.currency} · ${r.timeframe}`,
      },
      { label: "Period", value: `${fmtDate(r.start)} – ${fmtDate(r.end)}` },
      {
        label: "Capital",
        value: `${spec.currency} ${r.initialCapital.toLocaleString("en-AU")} each`,
      },
      {
        label: "Costs",
        value: `${flat}${r.feeBps}bp fee · ${r.slippageBps}bp slip`.replace(
          " · 0bp fee",
          "",
        ),
      },
    ],
  };
}
