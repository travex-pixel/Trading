"use client";

/**
 * The guided strategy builder. Every control maps to a field in the Zod
 * schema; there is no free-form code input anywhere. Market-aware: the
 * instrument picker sets the market, the market sets the default costs and
 * the execution assumptions shown beneath.
 */

import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { InstrumentPicker } from "@/components/market/instrument-picker";
import { Field, Input, NumberField, Segmented, Select } from "@/components/ui/field";
import { MARKETS, defaultInstrument, instrumentsFor, marketOf, rotationPair, type MarketId } from "@/lib/market/instruments";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind, StrategyParams } from "@/lib/strategies/schema";
import { tunableParams } from "@/lib/quant/validation";
import type { Timeframe } from "@/lib/quant/types";

export function configForKind(kind: StrategyKind, previous?: StrategyConfig): StrategyConfig {
  const defaults = STRATEGY_LIBRARY[kind].defaults;
  if (!previous) return defaults;
  const market = marketOf(previous.assets[0]);
  const assets = kind === "momentum_rotation" ? (previous.assets.length >= 2 ? previous.assets : [...rotationPair(market)]) : [previous.assets[0] ?? defaultInstrument(market).id];
  return {
    ...defaults,
    assets,
    timeframe: previous.timeframe,
    costs: previous.costs,
    initialCapital: previous.initialCapital,
    risk: { ...defaults.risk, sizing: previous.risk.sizing },
  };
}

const PARAM_LABELS: Record<string, { label: string; hint?: string; unit?: string }> = {
  fast: { label: "Fast period", hint: "Bars in the short average.", unit: "bars" },
  slow: { label: "Slow period", hint: "Bars in the long average.", unit: "bars" },
  signal: { label: "Signal period", hint: "Bars smoothing the MACD line.", unit: "bars" },
  period: { label: "RSI period", unit: "bars" },
  oversold: { label: "Oversold level", hint: "Buy when RSI drops below this." },
  overbought: { label: "Overbought level", hint: "Sell when RSI rises above this." },
  lookback: { label: "Lookback", hint: "Bars of history the rule compares against.", unit: "bars" },
  exitLookback: { label: "Exit lookback", hint: "Shorter window for the exit channel.", unit: "bars" },
  maPeriod: { label: "Trend average", unit: "bars" },
  atrPeriod: { label: "ATR period", unit: "bars" },
  atrMultiple: { label: "ATR multiple", hint: "Distance in units of recent volatility." },
  holdBars: { label: "Holding period", unit: "bars" },
  rebalanceBars: { label: "Rebalance every", unit: "bars" },
  minReturn: { label: "Minimum return", hint: "Hold cash unless the leader beats this." },
};

export function StrategyForm({ config, onChange, errors = [] }: { config: StrategyConfig; onChange: (c: StrategyConfig) => void; errors?: string[] }) {
  const [advanced, setAdvanced] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const meta = STRATEGY_LIBRARY[config.params.kind];
  const params = config.params;
  const market: MarketId = marketOf(config.assets[0]);
  const spec = MARKETS[market];
  const currency = spec.currency;

  const setParams = (patch: Partial<StrategyParams>) => onChange({ ...config, params: { ...params, ...patch } as StrategyParams });
  const setRisk = (patch: Partial<StrategyConfig["risk"]>) => onChange({ ...config, risk: { ...config.risk, ...patch } });
  const setCosts = (patch: Partial<StrategyConfig["costs"]>) => onChange({ ...config, costs: { ...config.costs, ...patch } });

  const isRotation = params.kind === "momentum_rotation";

  const changeMarket = (m: MarketId) => {
    const list = instrumentsFor(m);
    const assets = isRotation ? [...rotationPair(m)] : [list[0].id];
    onChange({ ...config, assets, costs: { ...MARKETS[m].defaultCosts } });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Strategy" htmlFor="kind">
          <Select id="kind" value={params.kind} onChange={(e) => onChange(configForKind(e.target.value as StrategyKind, config))}>
            {STRATEGY_ORDER.map((k) => (
              <option key={k} value={k}>
                {STRATEGY_LIBRARY[k].name}
                {STRATEGY_LIBRARY[k].benchmark ? " (benchmark)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input id="name" value={config.name} maxLength={80} onChange={(e) => onChange({ ...config, name: e.target.value })} />
        </Field>
      </div>

      <p className="text-sm text-ink-2 leading-5">{meta.summary}</p>

      <InstrumentPicker
        label={isRotation ? "Instruments to rotate between" : "Instrument"}
        value={config.assets}
        onChange={(ids) => onChange({ ...config, assets: ids })}
        market={market}
        onMarketChange={changeMarket}
        max={isRotation ? 4 : 1}
        min={isRotation ? 2 : 1}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Timeframe" hint={market === "CRYPTO" ? "Bar size the strategy reads. Crypto trades 24/7." : `Bar size the strategy reads. Daily bars are the natural unit for ${spec.shortName} equities. Intraday bars only cover the session.`}>
          <Segmented<Timeframe>
            label="Timeframe"
            value={config.timeframe}
            onChange={(t) => onChange({ ...config, timeframe: t })}
            options={[
              { value: "1h", label: "1h" },
              { value: "4h", label: "4h" },
              { value: "1d", label: "1d" },
            ]}
          />
        </Field>
        <Field label="Market" hint={spec.description}>
          <div className="flex h-9 items-center gap-2 text-sm text-ink-2">
            <span className="text-ink">{spec.name}</span>
            <span className="num text-xs text-ink-3">{currency}</span>
          </div>
        </Field>
      </div>

      {/* Strategy-specific parameters */}
      {params.kind === "ma_crossover" ? (
        <Field label="Average type">
          <Segmented<"sma" | "ema">
            label="Average type"
            value={params.maType}
            onChange={(maType) => setParams({ maType })}
            options={[
              { value: "ema", label: "Exponential" },
              { value: "sma", label: "Simple" },
            ]}
          />
        </Field>
      ) : null}
      {params.kind === "random_baseline" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="seed" label="Seed" value={params.seed} min={0} max={9999} onChange={(seed) => setParams({ seed })} hint="Same seed, same coin flips." />
          <NumberField id="flip" label="Flip probability" value={params.flipProbability} min={0.001} max={1} step={0.001} onChange={(flipProbability) => setParams({ flipProbability })} />
        </div>
      ) : null}
      {tunableParams(params).length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {tunableParams(params).map((p) => {
            const l = PARAM_LABELS[p.key] ?? { label: p.key };
            return (
              <NumberField
                key={p.key}
                id={`p-${p.key}`}
                label={l.label}
                hint={l.hint}
                unit={l.unit}
                value={p.value}
                min={p.min}
                max={p.max}
                step={p.integer ? 1 : p.step}
                onChange={(v) => setParams({ [p.key]: v } as Partial<StrategyParams>)}
              />
            );
          })}
        </div>
      ) : null}

      {/* Risk */}
      {params.kind !== "buy_and_hold" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="stop"
            label="Stop loss"
            unit="%"
            hint="0 disables. Sells if price falls this far below entry. Gaps fill at the open."
            value={config.risk.stopLossPct === null ? 0 : Math.round(config.risk.stopLossPct * 1000) / 10}
            min={0}
            max={50}
            step={0.5}
            onChange={(v) => setRisk({ stopLossPct: v <= 0 ? null : v / 100 })}
          />
          <NumberField
            id="tp"
            label="Take profit"
            unit="%"
            hint="0 disables. Sells once price is this far above entry."
            value={config.risk.takeProfitPct === null ? 0 : Math.round(config.risk.takeProfitPct * 1000) / 10}
            min={0}
            max={200}
            step={0.5}
            onChange={(v) => setRisk({ takeProfitPct: v <= 0 ? null : v / 100 })}
          />
        </div>
      ) : null}

      <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink" aria-expanded={advanced}>
        {advanced ? <CaretDown className="size-3.5" aria-hidden /> : <CaretRight className="size-3.5" aria-hidden />}
        Position sizing, brokerage and capital
      </button>

      {advanced ? (
        <div className="space-y-4 border-l border-hairline pl-4">
          <Field label="Position sizing">
            <Segmented<StrategyConfig["risk"]["sizing"]["mode"]>
              label="Position sizing"
              value={config.risk.sizing.mode}
              onChange={(mode) => {
                if (mode === "fixed_fraction") setRisk({ sizing: { mode, fraction: 1 } });
                else if (mode === "fixed_cash") setRisk({ sizing: { mode, amount: Math.round(config.initialCapital / 2) } });
                else setRisk({ sizing: { mode, targetDailyVolPct: 1.5, atrPeriod: 14, maxFraction: 1 } });
              }}
              options={[
                { value: "fixed_fraction", label: "Fraction of equity" },
                { value: "fixed_cash", label: "Fixed amount" },
                { value: "volatility_target", label: "Volatility target" },
              ]}
            />
          </Field>
          {config.risk.sizing.mode === "fixed_fraction" ? (
            <NumberField
              id="fraction"
              label="Fraction of equity per position"
              unit="%"
              value={Math.round(config.risk.sizing.fraction * 100)}
              min={1}
              max={100}
              onChange={(v) => setRisk({ sizing: { mode: "fixed_fraction", fraction: v / 100 } })}
            />
          ) : null}
          {config.risk.sizing.mode === "fixed_cash" ? (
            <NumberField
              id="amount"
              label="Amount per position"
              unit={currency}
              value={config.risk.sizing.amount}
              min={1}
              max={config.initialCapital}
              step={100}
              onChange={(v) => setRisk({ sizing: { mode: "fixed_cash", amount: v } })}
            />
          ) : null}
          {config.risk.sizing.mode === "volatility_target" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="tvol"
                label="Target daily volatility"
                unit="%"
                hint="Smaller positions when the market is wilder."
                value={config.risk.sizing.targetDailyVolPct}
                min={0.1}
                max={10}
                step={0.1}
                onChange={(v) => setRisk({ sizing: { ...config.risk.sizing, mode: "volatility_target", targetDailyVolPct: v } as StrategyConfig["risk"]["sizing"] })}
              />
              <NumberField
                id="maxf"
                label="Maximum fraction"
                unit="%"
                value={Math.round(config.risk.sizing.maxFraction * 100)}
                min={5}
                max={100}
                onChange={(v) => setRisk({ sizing: { ...config.risk.sizing, mode: "volatility_target", maxFraction: v / 100 } as StrategyConfig["risk"]["sizing"] })}
              />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="feefixed" label="Brokerage per order" unit={currency} hint={market === "ASX" ? "Flat fee per order, the norm for Australian brokers." : "Flat fee per order. Many brokers charge none."} value={config.costs.feeFixed ?? 0} min={0} max={200} step={0.5} onChange={(feeFixed) => setCosts({ feeFixed })} />
            <NumberField id="fee" label="Fee per side" unit="bp" hint="Percentage commission. 10 bp = 0.10%." value={config.costs.feeBps} min={0} max={100} step={1} onChange={(feeBps) => setCosts({ feeBps })} />
            <NumberField id="slip" label="Slippage per side" unit="bp" value={config.costs.slippageBps} min={0} max={100} step={1} onChange={(slippageBps) => setCosts({ slippageBps })} />
            <NumberField id="cap" label="Starting capital" unit={currency} value={config.initialCapital} min={100} max={10_000_000} step={100} onChange={(initialCapital) => onChange({ ...config, initialCapital })} />
          </div>
          <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => setCosts({ ...spec.defaultCosts })}>
            Reset to {spec.shortName} defaults ({spec.defaultCosts.feeFixed ? `${spec.defaultCosts.feeFixed} ${currency}/order, ` : ""}
            {spec.defaultCosts.feeBps} bp fee, {spec.defaultCosts.slippageBps} bp slippage)
          </button>
        </div>
      ) : null}

      <button type="button" onClick={() => setAssumptionsOpen((a) => !a)} className="flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink" aria-expanded={assumptionsOpen}>
        {assumptionsOpen ? <CaretDown className="size-3.5" aria-hidden /> : <CaretRight className="size-3.5" aria-hidden />}
        {spec.shortName} execution assumptions
      </button>
      {assumptionsOpen ? (
        <ul className="space-y-1.5 border-l border-hairline pl-4">
          {spec.assumptions.map((a) => (
            <li key={a} className="flex gap-2 text-xs text-ink-2 leading-4">
              <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-annot" />
              {a}
            </li>
          ))}
          <li className="flex gap-2 text-xs text-ink-2 leading-4">
            <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-annot" />
            Short selling: {spec.shortSelling}
          </li>
        </ul>
      ) : null}

      {errors.length ? (
        <ul role="alert" className="space-y-1 rounded-[var(--radius-md)] border border-down/30 bg-down-dim px-3 py-2 text-xs text-down">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
