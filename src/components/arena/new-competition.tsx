"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Field, Input, NumberField, Segmented, Select } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { InstrumentPicker } from "@/components/market/instrument-picker";
import { MARKETS, marketOf, rotationPair } from "@/lib/market/instruments";
import { PeriodPicker } from "@/components/lab/period-picker";
import { defaultRules, makeParticipant, MAX_PARTICIPANTS, SEED_BOTS, type CompetitionRules } from "@/lib/arena/competition";
import { useCandles } from "@/lib/market/client";
import type { AssetId, Timeframe } from "@/lib/quant/types";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";
import { newId } from "@/lib/store/local-store";
import type { Competition, CompetitionParticipant } from "@/lib/store/types";
import { selectCompetitions, selectExperiments, useRepository } from "@/lib/store/use-store";
import { KindBadge } from "./leaderboard";

interface Draft {
  name: string;
  kind: CompetitionParticipant["kind"];
  config: StrategyConfig;
}

export function NewCompetition() {
  const router = useRouter();
  const { items: experiments } = useRepository(selectExperiments);
  const { put } = useRepository(selectCompetitions);
  const { series, error, loading } = useCandles(["BTC", "ETH"], "4h");

  const dataRange = useMemo(() => {
    if (!series) return null;
    const c = series[0].candles;
    return { start: c[0].time, end: c[c.length - 1].time };
  }, [series]);

  const [name, setName] = useState("Friday night bot fight");
  const [rulesState, setRules] = useState<CompetitionRules | null>(null);
  // Rules start from the data range's defaults until the user edits them.
  const rules = rulesState ?? (dataRange ? defaultRules(dataRange.start, dataRange.end) : null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [yourSource, setYourSource] = useState<string>("");
  const [seedKeys, setSeedKeys] = useState<Set<string>>(new Set(SEED_BOTS.map((b) => b.key)));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const seedId = `${rules?.start ?? 0}-${rules?.end ?? 0}`;

  const yourOptions = useMemo(() => {
    const exps = (experiments ?? []).slice().sort((a, b) => b.createdAt - a.createdAt).map((e) => ({ value: `exp:${e.id}`, label: `${e.name} (v${e.version}, journal)`, config: e.config }));
    const lib = STRATEGY_ORDER.filter((k) => !STRATEGY_LIBRARY[k].benchmark).map((k) => ({ value: `lib:${k}`, label: `${STRATEGY_LIBRARY[k].name} (library defaults)`, config: STRATEGY_LIBRARY[k].defaults }));
    return [...exps, ...lib];
  }, [experiments]);

  const addYours = () => {
    const opt = yourOptions.find((o) => o.value === yourSource);
    if (!opt) return;
    setDrafts((d) => [...d.filter((x) => x.kind !== "you"), { name: opt.config.name, kind: "you", config: opt.config }]);
  };

  const participants = useMemo(() => {
    if (!rules) return [];
    const out: Draft[] = [...drafts];
    for (const bot of SEED_BOTS) {
      if (!seedKeys.has(bot.key)) continue;
      const cfg = bot.config(seedId);
      out.push({ name: bot.key === "candidate" ? cfg.name : bot.name, kind: "seeded_bot", config: cfg });
    }
    return out.slice(0, MAX_PARTICIPANTS);
  }, [drafts, seedKeys, rules, seedId]);

  const create = async () => {
    if (!rules) return;
    setFormError(null);
    if (!name.trim()) return setFormError("Give the competition a name.");
    if (participants.length < 2) return setFormError("A competition needs at least two competitors.");
    if (rules.end - rules.start < 30 * 86_400_000) return setFormError("Use a period of at least 30 days.");
    const built: CompetitionParticipant[] = [];
    for (const d of participants) {
      const p = makeParticipant(d.name, d.kind, d.config, rules);
      if (!p) return setFormError(`${d.name} cannot run under these rules (check assets for rotation strategies).`);
      built.push(p);
    }
    setSaving(true);
    const competition: Competition = { id: newId("cmp"), name: name.trim(), rules, participants: built, createdAt: Date.now(), status: "open" };
    await put(competition);
    router.push(`/arena/${competition.id}`);
  };

  if (error) return <ErrorState title="Market data unavailable" body={error} />;
  if (loading || !rules || !dataRange) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Rules" description="Every competitor runs under exactly these conditions." />
          <PanelBody className="space-y-5">
            <Field label="Competition name" htmlFor="cname">
              <Input id="cname" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <InstrumentPicker
                label="Instruments (single-asset bots trade the first; rotation bots use all)"
                value={rules.assets}
                onChange={(ids) => setRules({ ...rules, assets: ids as AssetId[] })}
                market={marketOf(rules.assets[0])}
                onMarketChange={(m) => {
                  const costs = MARKETS[m].defaultCosts;
                  setRules({ ...rules, assets: [...rotationPair(m)], feeBps: costs.feeBps, slippageBps: costs.slippageBps, feeFixed: costs.feeFixed });
                }}
                max={4}
                min={1}
                className="sm:col-span-2"
              />
              <Field label="Timeframe">
                <Segmented<Timeframe>
                  label="Timeframe"
                  value={rules.timeframe}
                  onChange={(timeframe) => setRules({ ...rules, timeframe })}
                  options={[
                    { value: "1h", label: "1h" },
                    { value: "4h", label: "4h" },
                    { value: "1d", label: "1d" },
                  ]}
                />
              </Field>
            </div>
            <PeriodPicker period={{ start: rules.start, end: rules.end }} onChange={(p) => setRules({ ...rules, start: p.start, end: p.end })} dataStart={dataRange.start} dataEnd={dataRange.end} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField id="feefixed" label="Brokerage per order" unit={MARKETS[marketOf(rules.assets[0])].currency} value={rules.feeFixed ?? 0} min={0} max={200} step={0.5} onChange={(feeFixed) => setRules({ ...rules, feeFixed })} />
              <NumberField id="capital" label="Starting capital" unit={MARKETS[marketOf(rules.assets[0])].currency} value={rules.initialCapital} min={100} max={10_000_000} step={100} onChange={(initialCapital) => setRules({ ...rules, initialCapital })} />
              <NumberField id="fee" label="Fee per side" unit="bp" value={rules.feeBps} min={0} max={100} onChange={(feeBps) => setRules({ ...rules, feeBps })} />
              <NumberField id="slip" label="Slippage per side" unit="bp" value={rules.slippageBps} min={0} max={100} onChange={(slippageBps) => setRules({ ...rules, slippageBps })} />
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Your strategy" description="Pick a saved experiment or a library strategy. You can also leave it out and just watch the bots." />
          <PanelBody className="flex flex-wrap items-end gap-3">
            <Field label="Entry" className="min-w-0 flex-1" htmlFor="yours">
              <Select id="yours" value={yourSource} onChange={(e) => setYourSource(e.target.value)}>
                <option value="">Choose a strategy…</option>
                {yourOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={addYours} disabled={!yourSource}>
              {drafts.some((d) => d.kind === "you") ? "Replace entry" : "Enter"}
            </Button>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Seeded bots" description="Strategies EdgeLab adds for you. They are labelled as bots on the board, never as people." />
          <ul className="divide-y divide-hairline">
            {SEED_BOTS.map((bot) => {
              const checked = seedKeys.has(bot.key);
              const id = `bot-${bot.key}`;
              return (
                <li key={bot.key} className="flex items-start gap-3 px-4 py-3">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(seedKeys);
                      if (e.target.checked) next.add(bot.key);
                      else next.delete(bot.key);
                      setSeedKeys(next);
                    }}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      {bot.name} <Badge tone="muted">Bot</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-2 leading-4">{bot.description}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="lg:sticky lg:top-6">
        <Panel>
          <PanelHeader title={`Competitors (${participants.length}/${MAX_PARTICIPANTS})`} />
          {participants.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-3">Add your strategy or tick at least two bots.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {participants.map((p, i) => (
                <li key={`${p.kind}-${p.name}-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="num w-5 text-ink-3">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                  <KindBadge kind={p.kind} />
                  {p.kind === "you" ? (
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setDrafts((d) => d.filter((x) => x !== p))} className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-hairline px-4 py-3">
            {formError ? (
              <p role="alert" className="mb-2 text-xs text-down">
                {formError}
              </p>
            ) : null}
            <Button variant="primary" className="w-full" onClick={create} disabled={saving || participants.length < 2}>
              {saving ? "Creating…" : "Create competition"}
            </Button>
            <p className="mt-2 text-2xs text-ink-3">Stored in this browser. Share it afterwards with a link that anyone can open.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export type { StrategyKind };
