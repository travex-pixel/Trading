"use client";

/**
 * Markets: pick a market, see its status and every supported instrument with
 * recent performance, search, and jump into the Lab with one tap. States the
 * data source and freshness plainly.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { PageHeader, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { fmtDate, fmtDateTime, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { useNow } from "@/components/home/use-now";
import { marketRows } from "@/lib/home/overview";
import { CALENDARS, marketStatus, tzLabel } from "@/lib/market/calendar";
import { useCandles } from "@/lib/market/client";
import { DEFAULT_MARKET, instrumentsFor, MARKET_ORDER, MARKETS, type MarketId } from "@/lib/market/instruments";
import { cn } from "@/lib/utils";
import { MarketSelector } from "./instrument-picker";

interface StatusPayload {
  now: number;
  markets: Array<{ id: MarketId; data: { provider: string; label: string; isSynthetic: boolean } }>;
  providers: Array<{ name: string; configured: boolean; markets: MarketId[]; freshness: string; note: string }>;
}

interface QuotePayload {
  configured: boolean;
  quotes: Array<{ instrumentId: string; price: number; changePct: number | null; time: number; source: { label: string } }>;
}

export function MarketsBrowser({ initialMarket = DEFAULT_MARKET }: { initialMarket?: MarketId }) {
  const [market, setMarket] = useState<MarketId>(initialMarket);
  const [query, setQuery] = useState("");
  const instruments = useMemo(() => instrumentsFor(market), [market]);
  const ids = useMemo(() => instruments.map((i) => i.id), [instruments]);
  const { series, error, loading } = useCandles(ids, "1d");
  const rows = useMemo(() => (series ? marketRows(series) : null), [series]);
  const now = useNow();
  const status = now ? marketStatus(market, now) : null;
  const cal = CALENDARS[market];
  const spec = MARKETS[market];

  const [dataStatus, setDataStatus] = useState<StatusPayload | null>(null);
  const [quotes, setQuotes] = useState<QuotePayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: StatusPayload | null) => {
        if (!cancelled && j) setDataStatus(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market/quotes?ids=${encodeURIComponent(ids.slice(0, 12).join(","))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: QuotePayload | null) => {
        if (!cancelled && j) setQuotes(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);
  const quoteById = useMemo(() => new Map((quotes?.quotes ?? []).map((q) => [q.instrumentId, q])), [quotes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows ?? [];
    if (!q) return base;
    return base.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const marketData = dataStatus?.markets.find((m) => m.id === market)?.data ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Markets"
        description={`${spec.name}. ${spec.description}`}
        actions={<MarketSelector value={market} onChange={(m) => { setMarket(m); setQuery(""); }} />}
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {status ? (
              <span className={cn("inline-flex items-center gap-1.5 font-medium", status.state === "open" || status.state === "always_open" ? "text-up" : "text-ink-2")}>
                <span aria-hidden className={cn("size-1.5 rounded-full", status.state === "open" || status.state === "always_open" ? "bg-up" : "bg-ink-3")} />
                {status.state === "open" ? "Open" : status.state === "always_open" ? "Open 24/7" : `Closed · ${status.reason === "weekend" ? "weekend" : status.reason === "holiday" ? "public holiday" : status.reason === "pre_market" ? "pre-market" : "after hours"}`}
              </span>
            ) : (
              <Skeleton className="h-4 w-24" />
            )}
            {cal.session ? (
              <span className="num text-xs text-ink-3">
                Session {cal.session.open}–{cal.session.close} local{now ? ` · ${tzLabel(market, now)}` : ""}
              </span>
            ) : (
              <span className="num text-xs text-ink-3">UTC, no sessions</span>
            )}
            {status?.state === "closed" && status.opensAt ? <span className="num text-xs text-ink-3">Next open {fmtDateTime(status.opensAt)}</span> : null}
            {status?.state === "open" ? <span className="num text-xs text-ink-3">Closes {fmtDateTime(status.closesAt)}</span> : null}
          </div>
          <div className="text-xs">
            {marketData ? (
              <span className={cn("font-mono", marketData.isSynthetic ? "text-warn" : "text-up")}>{marketData.isSynthetic ? "DEMO DATA · synthetic" : marketData.label}</span>
            ) : (
              <Skeleton className="h-4 w-40" />
            )}
          </div>
        </div>
      </Panel>

      {error ? <ErrorState title="Market data unavailable" body={error} /> : null}

      <Panel>
        <PanelHeader
          title={`${spec.shortName} instruments`}
          description={`${instruments.length} supported · ${spec.currency}`}
          aside={
            <label className="flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-raised px-2.5">
              <Search className="size-3.5 text-ink-3" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search instruments" className="w-28 bg-transparent text-xs text-ink placeholder:text-ink-4 focus:outline-none sm:w-40" inputMode="search" />
            </label>
          }
        />
        {loading && !rows ? (
          <PanelBody className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </PanelBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Instrument</th>
                  <th scope="col" className="num">{quotes?.configured ? "Quote" : "Last close"}</th>
                  <th scope="col" className="num">1d</th>
                  <th scope="col" className="num hidden sm:table-cell">1m</th>
                  <th scope="col" className="num hidden md:table-cell">1y</th>
                  <th scope="col" className="hidden sm:table-cell" />
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const inst = instruments.find((i) => i.id === r.asset)!;
                  const q = quoteById.get(r.asset);
                  return (
                    <tr key={r.asset}>
                      <td>
                        <Link href={`/lab/build?asset=${encodeURIComponent(r.asset)}`} className="flex min-w-0 max-w-[46vw] flex-col hover:underline underline-offset-2 sm:max-w-none">
                          <span className="flex items-center gap-2">
                            <span className="num font-semibold text-ink">{r.symbol}</span>
                            <span className="num text-2xs text-ink-3">
                              {inst.exchange} · {inst.currency}
                            </span>
                            {inst.kind === "etf" ? <Badge tone="muted">ETF</Badge> : null}
                          </span>
                          <span className="truncate text-xs text-ink-2">{r.name}</span>
                        </Link>
                      </td>
                      <td className="num text-ink">
                        {q ? (
                          <>
                            {fmtPrice(q.price, r.currency)}
                            <span className="block text-2xs text-ink-3">delayed · {fmtDateTime(q.time)}</span>
                          </>
                        ) : (
                          <>
                            {fmtPrice(r.last, r.currency)}
                            <span className="block text-2xs text-ink-3">{fmtDate(r.lastTime)}</span>
                          </>
                        )}
                      </td>
                      <td className={cn("num", signClass(q?.changePct ?? r.change1dPct))}>{fmtPct(q?.changePct ?? r.change1dPct, { sign: true })}</td>
                      <td className={cn("num hidden sm:table-cell", signClass(r.change1mPct))}>{fmtPct(r.change1mPct, { sign: true })}</td>
                      <td className={cn("num hidden md:table-cell", signClass(r.change1yPct))}>{fmtPct(r.change1yPct, { sign: true })}</td>
                      <td className="hidden sm:table-cell">
                        <Sparkline values={r.closes} width={80} height={24} tone="muted" />
                      </td>
                      <td className="text-right">
                        <Link href={`/lab/build?asset=${encodeURIComponent(r.asset)}`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-annot hover:underline underline-offset-2">
                          Test <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && rows ? (
                  <tr>
                    <td colSpan={7} className="text-xs text-ink-3">
                      No instruments match “{query}”. The supported {spec.shortName} universe is listed above; more can be added to the registry.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {series?.[0] ? <ProvenancePlate source={series[0].source} timeframe="1d" currency={spec.currency} market={spec.shortName} /> : null}
      </Panel>

      <Panel>
        <PanelHeader title="Data connections" description="Where prices come from, per market. Nothing is shown as live unless a live provider is connected." />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Markets</th>
                <th scope="col">Data</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {(dataStatus?.providers ?? []).map((p) => (
                <tr key={p.name}>
                  <td className="text-ink">{p.name === "eodhd" ? "EODHD" : p.name === "coinbase" ? "Coinbase Exchange" : "Demo dataset"}</td>
                  <td className="num text-ink-2">{p.markets.join(", ")}</td>
                  <td className="text-xs text-ink-2">{p.freshness}</td>
                  <td>
                    <span className="flex flex-col gap-0.5">
                      <Badge tone={p.configured ? (p.name === "demo" ? "warn" : "up") : "muted"}>{p.configured ? (p.name === "demo" ? "Active (synthetic)" : "Connected") : "Not configured"}</Badge>
                      <span className="text-2xs text-ink-3">{p.note}</span>
                    </span>
                  </td>
                </tr>
              ))}
              {!dataStatus ? (
                <tr>
                  <td colSpan={4}>
                    <Skeleton className="h-4 w-1/2" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-2xs text-ink-3">
          Markets listed: {MARKET_ORDER.map((m) => `${MARKETS[m].shortName} (${MARKETS[m].status})`).join(", ")}. Forex is not available in this release.
        </p>
      </Panel>
    </div>
  );
}
