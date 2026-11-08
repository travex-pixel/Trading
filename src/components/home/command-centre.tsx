"use client";

/**
 * Command Centre: one screen, no scrolling. It opens on the best strategy for
 * an ASX instrument you can switch with a tap, says what it is and what the
 * result means in plain English, and puts one action in front of you: test
 * it yourself. Everything deeper (the full ranking, your journal, the guide)
 * opens in a sheet over this screen.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowRight,
  CaretRight,
  Lightning,
  ListNumbers,
  Plus,
  Question,
  Wallet,
} from "@phosphor-icons/react";
import { EquityChart } from "@/components/charts/equity-chart";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Cell, ProvenancePlate } from "@/components/ui/provenance";
import { VerdictBadge } from "@/components/ui/verdict";
import { useTodaysQuiz } from "@/components/daily/daily-quiz";
import { computeStreak, useDailyRecord } from "@/lib/daily/store";
import { QUIZ_SIZE, scoreQuiz } from "@/lib/daily/quiz";
import {
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtPrice,
  signClass,
  type Currency,
} from "@/lib/format";
import {
  bestStrategyReport,
  type BestStrategyReport,
  type MeaningPoint,
  type RankedStrategy,
} from "@/lib/home/best";
import {
  buildLeaderboard,
  deriveAlerts,
  HOME_TIMEFRAME,
  HOME_WATCHLIST,
} from "@/lib/home/overview";
import { useMonitor } from "@/lib/home/signals";
import { marketStatus, tzLabel } from "@/lib/market/calendar";
import { useCandles } from "@/lib/market/client";
import { getInstrument } from "@/lib/market/instruments";
import type { PaperState } from "@/lib/quant/paper";
import {
  selectExperiments,
  selectPortfolios,
  useRepository,
} from "@/lib/store/use-store";
import { cn } from "@/lib/utils";
import { GuideSheet, useOnboarding } from "./onboarding";
import { useNow } from "./use-now";

const DEFAULT_ASSET = "ASX:CBA";

export function CommandCentre() {
  const { series, error, loading } = useCandles(
    [...HOME_WATCHLIST],
    HOME_TIMEFRAME,
  );
  const experiments = useRepository(selectExperiments);
  const portfolios = useRepository(selectPortfolios);
  const monitor = useMonitor(experiments.items, portfolios.items);
  const onboarding = useOnboarding();

  const [asset, setAsset] = useState<string>(DEFAULT_ASSET);
  const [sheet, setSheet] = useState<"none" | "ranking" | "guide">("none");
  const closeSheet = useCallback(() => setSheet("none"), []);

  const current = useMemo(
    () => series?.find((s) => s.asset === asset) ?? series?.[0] ?? null,
    [series, asset],
  );
  const report = useMemo(
    () => (current ? bestStrategyReport(current) : null),
    [current],
  );
  const journalBoard = useMemo(
    () =>
      experiments.items && experiments.items.length > 0
        ? buildLeaderboard(experiments.items, null)
        : null,
    [experiments.items],
  );
  const alerts = useMemo(
    () =>
      experiments.items
        ? deriveAlerts({
            rows: journalBoard?.rows ?? [],
            experiments: experiments.items,
            paper: monitor.paper,
          })
        : [],
    [journalBoard, experiments.items, monitor.paper],
  );

  const guideOpen = sheet === "guide";
  const firstVisit = onboarding.dismissed === false;

  return (
    <div className="fit-screen flex min-h-[560px] flex-col gap-3 lg:gap-4">
      <TopBar onGuide={() => setSheet("guide")} firstVisit={firstVisit} />

      {error ? (
        <ErrorState title="Market data unavailable" body={error} />
      ) : null}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-1 lg:gap-4">
        <BestStrategyHero
          report={report}
          loading={loading && !series}
          asset={current?.asset ?? asset}
          onAsset={setAsset}
          lastClose={
            current ? current.candles[current.candles.length - 1] : null
          }
          prevClose={
            current && current.candles.length > 1
              ? current.candles[current.candles.length - 2]
              : null
          }
          onRanking={() => setSheet("ranking")}
        />

        {/* Phone: three tiles in a row. Desktop: a column with the ranking in full. */}
        <div className="grid grid-cols-3 gap-3 lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
          <QuizTile />
          <PortfolioTile
            paper={monitor.paper}
            signals={monitor.signals.length}
            loading={monitor.loading || portfolios.loading}
          />
          <Tile
            label="Ranking"
            value={report ? `${report.ranked.length} strategies` : "…"}
            icon={ListNumbers}
            onClick={() => setSheet("ranking")}
            className="lg:hidden"
          />
          <RankingPanel
            report={report}
            className="hidden lg:flex"
            onMore={() => setSheet("ranking")}
          />
        </div>
      </div>

      {sheet === "ranking" && report ? (
        <RankingSheet
          report={report}
          journal={journalBoard?.rows ?? []}
          alerts={alerts}
          onClose={closeSheet}
        />
      ) : null}
      {guideOpen ? (
        <GuideSheet
          onClose={() => {
            onboarding.dismiss();
            closeSheet();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Top bar                                                                    */
/* ------------------------------------------------------------------------- */

function TopBar({
  onGuide,
  firstVisit,
}: {
  onGuide: () => void;
  firstVisit: boolean;
}) {
  const now = useNow();
  const status = now ? marketStatus("ASX", now) : null;
  const open = status?.state === "open";
  const label = !status
    ? null
    : status.state === "open"
      ? `ASX open · closes ${new Date(status.closesAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })}`
      : status.state === "closed"
        ? `ASX closed${status.opensAt ? ` · opens ${new Date(status.opensAt).toLocaleString("en-AU", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })}` : ""}`
        : "ASX open";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-ink lg:text-xl">
          Command Centre
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {label ? (
          <Link
            href="/markets"
            className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-2xs text-ink-2 hover:border-border-strong hover:text-ink sm:inline-flex"
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                open ? "bg-up" : "bg-ink-3",
              )}
            />
            <span className="num whitespace-nowrap">{label}</span>
            {now ? (
              <span className="num hidden text-ink-4 md:inline">
                {tzLabel("ASX", now)}
              </span>
            ) : null}
          </Link>
        ) : (
          <Skeleton className="hidden h-6 w-40 sm:block" />
        )}
        <Button
          size="sm"
          variant={firstVisit ? "secondary" : "ghost"}
          onClick={onGuide}
          aria-label="How EdgeLab works"
        >
          <Question
            className="size-4"
            weight={firstVisit ? "fill" : "regular"}
            aria-hidden
          />{" "}
          <span className={firstVisit ? "" : "hidden sm:inline"}>
            {firstVisit ? "How it works" : "Guide"}
          </span>
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="hidden lg:inline-flex"
          asChild
        >
          <Link href="/lab/build">
            <Plus className="size-4" weight="bold" aria-hidden /> New experiment
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Hero                                                                       */
/* ------------------------------------------------------------------------- */

function BestStrategyHero({
  report,
  loading,
  asset,
  onAsset,
  lastClose,
  prevClose,
  onRanking,
}: {
  report: BestStrategyReport | null;
  loading: boolean;
  asset: string;
  onAsset: (a: string) => void;
  lastClose: { time: number; close: number } | null;
  prevClose: { time: number; close: number } | null;
  onRanking: () => void;
}) {
  const options = HOME_WATCHLIST.map((id) => ({
    value: id,
    label: getInstrument(id)?.symbol ?? id,
  }));
  const inst = getInstrument(asset);
  const change =
    lastClose && prevClose && prevClose.close > 0
      ? (lastClose.close / prevClose.close - 1) * 100
      : null;

  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      {/* Instrument strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="whitespace-nowrap font-mono text-2xs uppercase tracking-wider text-ink-4">
            Best on
          </span>
          <span className="truncate text-sm font-semibold text-ink sm:hidden">
            {inst?.symbol ?? asset}
          </span>
          <span className="hidden truncate text-sm font-semibold text-ink sm:inline">
            {inst?.name ?? asset}
          </span>
          {lastClose && report ? (
            <span className="num whitespace-nowrap text-xs text-ink-3">
              {fmtPrice(lastClose.close, report.currency)}{" "}
              <span className={signClass(change)}>
                {fmtPct(change, { sign: true })}
              </span>
            </span>
          ) : null}
        </div>
        <Segmented
          size="sm"
          label="Instrument"
          value={asset}
          onChange={onAsset}
          options={options}
        />
      </div>

      {!report ? (
        <div className="flex flex-1 flex-col gap-4 p-4" aria-busy={loading}>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-12 w-72" />
          <Skeleton className="min-h-32 flex-1 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <HeroBody report={report} onRanking={onRanking} />
      )}
    </Panel>
  );
}

function HeroBody({
  report,
  onRanking,
}: {
  report: BestStrategyReport;
  onRanking: () => void;
}) {
  const { best, buyAndHold, meaning, assessment, symbol, currency } = report;
  const m = best.result.metrics;
  const b = buyAndHold.metrics;
  const testHref = `/lab/build?kind=${best.kind}&asset=${encodeURIComponent(report.asset)}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-4 sm:px-5">
      {/* Name and verdict */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="text-[22px] font-semibold leading-7 tracking-tight text-ink sm:text-2xl">
          {best.name}
        </h2>
        <VerdictBadge verdict={assessment.verdict} size="sm" />
      </div>
      <p className="mt-1 line-clamp-1 max-w-[60ch] text-sm leading-5 text-ink-2 text-pretty sm:line-clamp-none">
        {best.summary}
      </p>

      {/* Figures */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Figure
          label="Return"
          value={fmtPct(m.totalReturnPct, { sign: true })}
          tone={m.totalReturnPct >= 0 ? "up" : "down"}
          sub={`hold ${fmtPct(b.totalReturnPct, { sign: true })}`}
          hero
        />
        <Figure
          label="Worst fall"
          value={fmtPct(-m.maxDrawdownPct)}
          tone="down"
          sub={`hold ${fmtPct(-b.maxDrawdownPct)}`}
        />
        <Figure
          label="Per unit of risk"
          value={best.score === null ? "–" : fmtNum(best.score)}
          tone="neutral"
          sub={`${fmtInt(m.tradeCount)} trades`}
        />
      </div>

      {/* Chart fills whatever is left */}
      <div className="relative mt-2 min-h-[72px] flex-1">
        <div className="absolute inset-0">
          <EquityChart
            series={[
              {
                id: "best",
                name: best.name,
                points: best.result.equity,
                color: "var(--series-1)",
              },
              {
                id: "bh",
                name: `Hold ${symbol}`,
                points: buyAndHold.equity,
                color: "var(--series-muted)",
                muted: true,
              },
            ]}
            height={0}
            fill
            compact
            currency={currency}
          />
        </div>
      </div>

      {/* Meaning */}
      <div className="mt-2 border-t border-hairline pt-3">
        <p className="line-clamp-2 text-sm leading-5 text-ink text-pretty sm:line-clamp-none">
          {meaning.headline}
        </p>
        <p className="mt-1 line-clamp-1 text-xs leading-4 text-ink-3 text-pretty sm:line-clamp-none">
          {meaning.caveat}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto sm:min-w-56"
          asChild
        >
          <Link href={testHref}>
            Test this on {symbol}{" "}
            <ArrowRight className="size-4" weight="bold" aria-hidden />
          </Link>
        </Button>
        <button
          type="button"
          onClick={onRanking}
          className="hidden h-10 items-center justify-center gap-1 rounded-[var(--radius-md)] px-3 text-sm text-ink-2 hover:bg-hover hover:text-ink sm:inline-flex"
        >
          What this means and the full ranking{" "}
          <CaretRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
  hero = false,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "up" | "down" | "neutral";
  hero?: boolean;
}) {
  const toneCls =
    tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";
  return (
    <div className="min-w-0">
      <div className="text-2xs leading-4 text-ink-3">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate leading-none",
          hero
            ? "num-hero text-[26px] sm:text-3xl"
            : "num text-[26px] sm:text-2xl",
          toneCls,
        )}
      >
        {value}
      </div>
      <div className="num mt-1 truncate text-2xs text-ink-3">{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Tiles                                                                      */
/* ------------------------------------------------------------------------- */

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  href,
  onClick,
  tone,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Lightning;
  href?: string;
  onClick?: () => void;
  tone?: "warn" | "up";
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-2xs font-medium text-ink-3">
          {label}
        </span>
        <Icon
          className={cn(
            "size-4 shrink-0",
            tone === "warn"
              ? "text-warn"
              : tone === "up"
                ? "text-up"
                : "text-ink-3",
          )}
          weight={tone ? "fill" : "regular"}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 truncate text-sm font-semibold text-ink lg:text-base">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-2xs text-ink-3">{sub}</div>
      ) : null}
    </>
  );
  const cls = cn(
    "flex min-h-[76px] flex-col justify-between rounded-[var(--radius-md)] border border-hairline bg-panel px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-hover active:scale-[0.99] lg:min-h-[84px] lg:px-4 lg:py-3",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function QuizTile() {
  const { quiz, date } = useTodaysQuiz();
  const { record } = useDailyRecord();
  const day = record?.days[date] ?? null;
  const streak = record ? computeStreak(record, date) : 0;
  const completed = day?.completedAt != null;
  const scored = quiz && day ? scoreQuiz(quiz, day.answers) : null;
  return (
    <Tile
      label="Daily quiz"
      value={
        completed && scored
          ? `${scored.score}/${QUIZ_SIZE} · Review`
          : "Play · 2 min"
      }
      sub={
        streak >= 2
          ? `${streak}-day streak`
          : completed
            ? "New five tomorrow"
            : "Edge or luck?"
      }
      icon={Lightning}
      href="/daily"
      tone={completed ? "up" : "warn"}
    />
  );
}

function PortfolioTile({
  paper,
  signals,
  loading,
}: {
  paper: PaperState[];
  signals: number;
  loading: boolean;
}) {
  const running = paper.filter((p) => p.portfolio.status === "running");
  const ccy = (running[0]?.result?.currency ??
    paper[0]?.result?.currency ??
    "AUD") as Currency;
  const total = running.reduce((s, p) => s + p.equity, 0);
  const capital = running.reduce(
    (s, p) => s + p.portfolio.config.initialCapital,
    0,
  );
  const pnl = total - capital;
  if (loading && paper.length === 0)
    return <Tile label="Portfolio" value="…" icon={Wallet} href="/paper" />;
  if (running.length === 0)
    return (
      <Tile
        label="Portfolio"
        value="Start one"
        sub="Virtual capital"
        icon={Wallet}
        href="/paper"
      />
    );
  return (
    <Tile
      label="Simulated"
      value={fmtMoney(total, { currency: ccy, compact: true })}
      sub={`${pnl >= 0 ? "+" : ""}${fmtPct(capital > 0 ? (pnl / capital) * 100 : 0)}${signals ? ` · ${signals} signal${signals === 1 ? "" : "s"}` : ` · ${running.length} running`}`}
      icon={Wallet}
      href="/paper"
      tone={pnl >= 0 ? "up" : undefined}
    />
  );
}

/* ------------------------------------------------------------------------- */
/* Ranking (desktop panel and the sheet)                                      */
/* ------------------------------------------------------------------------- */

function RankingPanel({
  report,
  className,
  onMore,
}: {
  report: BestStrategyReport | null;
  className?: string;
  onMore: () => void;
}) {
  return (
    <Panel className={cn("min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            Ranking on {report?.symbol ?? "…"}
          </h2>
          <p className="mt-0.5 text-xs leading-4 text-ink-3">
            Return per unit of risk, same bars, same costs.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onMore}>
          What it means <CaretRight className="size-3.5" aria-hidden />
        </Button>
      </div>
      {!report ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <RankingList report={report} />
        </div>
      )}
      {report ? (
        <ProvenancePlate
          source={report.source}
          period={report.period}
          timeframe={report.timeframe}
          currency={report.currency}
          market="ASX"
        />
      ) : null}
    </Panel>
  );
}

function RankingList({
  report,
  dense = false,
}: {
  report: BestStrategyReport;
  dense?: boolean;
}) {
  return (
    <ol className="divide-y divide-hairline">
      {report.ranked.map((r) => (
        <RankingRow key={r.kind} row={r} asset={report.asset} dense={dense} />
      ))}
    </ol>
  );
}

function RankingRow({
  row,
  asset,
  dense,
}: {
  row: RankedStrategy;
  asset: string;
  dense: boolean;
}) {
  const m = row.result.metrics;
  return (
    <li>
      <Link
        href={`/lab/build?kind=${row.kind}&asset=${encodeURIComponent(asset)}`}
        className={cn(
          "flex items-center gap-3 px-4 hover:bg-hover",
          dense ? "py-2" : "py-2.5",
        )}
      >
        <span
          className={cn(
            "num w-5 shrink-0 text-center text-xs",
            row.rank === 1 ? "text-ink" : "text-ink-4",
          )}
        >
          {row.rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-ink">{row.name}</span>
            {row.rank === 1 ? <Badge tone="up">Best</Badge> : null}
          </span>
          <span className="num block truncate text-2xs text-ink-3">
            {m.tradeCount === 0
              ? "no trades in this period"
              : `${fmtInt(m.tradeCount)} trades · worst fall ${fmtPct(m.maxDrawdownPct)}${row.beatsHolding ? " · beat holding" : ""}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn("num text-sm", signClass(m.totalReturnPct))}>
            {fmtPct(m.totalReturnPct, { sign: true })}
          </span>
          <span className="num text-2xs text-ink-3">
            {row.score === null ? "–" : fmtNum(row.score)} risk-adj.
          </span>
        </span>
      </Link>
    </li>
  );
}

function RankingSheet({
  report,
  journal,
  alerts,
  onClose,
}: {
  report: BestStrategyReport;
  journal: ReturnType<typeof buildLeaderboard>["rows"];
  alerts: ReturnType<typeof deriveAlerts>;
  onClose: () => void;
}) {
  const { best, meaning, symbol } = report;
  return (
    <Dialog
      title={`${best.name} on ${symbol}`}
      description={`Best of ${report.ranked.length} library strategies · ${fmtDate(report.period.start)} – ${fmtDate(report.period.end)} · daily bars`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-2xs text-ink-3">
            {report.source.isSynthetic
              ? "Demo dataset. A result on it is not a tradable edge."
              : report.source.label}
          </span>
          <Button
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
            asChild
          >
            <Link
              href={`/lab/build?kind=${best.kind}&asset=${encodeURIComponent(report.asset)}`}
            >
              Test this on {symbol}{" "}
              <ArrowRight className="size-4" weight="bold" aria-hidden />
            </Link>
          </Button>
        </div>
      }
    >
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-4">
          What it is
        </h3>
        <p className="mt-1.5 text-sm leading-5 text-ink">{best.summary}</p>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-4">
          What the result means
        </h3>
        <p className="mt-1.5 text-sm leading-5 text-ink">{meaning.headline}</p>
        <ul className="mt-2.5 space-y-2">
          {meaning.points.map((p) => (
            <MeaningItem key={p.text} point={p} />
          ))}
        </ul>
        <div className="mt-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-hairline bg-raised px-3 py-2.5">
          <VerdictBadge
            verdict={report.assessment.verdict}
            size="sm"
            className="mt-px shrink-0"
          />
          <p className="text-xs leading-4 text-ink-2">{meaning.caveat}</p>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-4">
          How the ranking works
        </h3>
        <p className="mt-1.5 text-xs leading-4 text-ink-2">
          {meaning.howRanked}
        </p>
        <div className="mt-2.5 -mx-5 border-y border-hairline">
          <RankingList report={report} dense />
        </div>
      </section>

      {journal.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-4">
            Your experiments
          </h3>
          <ol className="mt-1.5 divide-y divide-hairline">
            {journal.slice(0, 5).map((r, i) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="flex items-center gap-3 py-2 hover:text-ink"
                >
                  <span className="num w-5 text-center text-xs text-ink-4">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-ink">
                        {r.name}
                      </span>
                      {r.verdict ? (
                        <VerdictBadge verdict={r.verdict} size="sm" />
                      ) : null}
                    </span>
                    <span className="num block text-2xs text-ink-3">
                      {r.instrumentLabel}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "num text-sm",
                      signClass(r.metrics.totalReturnPct),
                    )}
                  >
                    {fmtPct(r.metrics.totalReturnPct, { sign: true })}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {alerts.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-4">
            Worth a look
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-[7px] size-1.5 shrink-0 rounded-full",
                    a.tone === "down"
                      ? "bg-down"
                      : a.tone === "warn"
                        ? "bg-warn"
                        : "bg-annot",
                  )}
                  aria-hidden
                />
                {a.href ? (
                  <Link
                    href={a.href}
                    className="text-xs leading-4 text-ink-2 hover:text-ink"
                  >
                    {a.text}
                  </Link>
                ) : (
                  <span className="text-xs leading-4 text-ink-2">{a.text}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs text-ink-4">
        <Cell
          label="Data"
          value={
            report.source.isSynthetic ? "DEMO · synthetic" : report.source.label
          }
          emphasis={report.source.isSynthetic ? "warn" : undefined}
        />
        <Cell label="Fills" value="next open" />
        <Cell
          label="Costs"
          value={`${best.config.costs.feeFixed ?? 0} ${report.currency}/order · ${best.config.costs.slippageBps}bp slip`}
        />
      </div>
      <div className="mt-3">
        <SimulatedBadge />
      </div>
    </Dialog>
  );
}

function MeaningItem({ point }: { point: MeaningPoint }) {
  const dot =
    point.tone === "up"
      ? "bg-up"
      : point.tone === "down"
        ? "bg-down"
        : point.tone === "warn"
          ? "bg-warn"
          : "bg-ink-3";
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", dot)}
        aria-hidden
      />
      <span className="text-sm leading-5 text-ink-2">{point.text}</span>
    </li>
  );
}
