"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Panel } from "@/components/ui/panel";
import { fmtDate, fmtMoney } from "@/lib/format";
import { currencyOf } from "@/lib/market/instruments";
import type { PaperPortfolio } from "@/lib/quant/paper";
import { selectPortfolios, useRepository } from "@/lib/store/use-store";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { cn } from "@/lib/utils";
import { PortfolioDetail } from "./portfolio-detail";

export function PaperDesk() {
  const params = useSearchParams();
  const router = useRouter();
  const { items, loading, put, remove } = useRepository(selectPortfolios);
  const selectedId = params.get("id");
  const sorted = useMemo(() => (items ? [...items].sort((a, b) => Number(a.status === "stopped") - Number(b.status === "stopped") || b.createdAt - a.createdAt) : null), [items]);
  const selected = useMemo(() => sorted?.find((p) => p.id === selectedId) ?? null, [sorted, selectedId]);

  if (loading || !sorted) return <Skeleton className="h-64 w-full" />;

  if (sorted.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No simulated portfolios yet"
          body="Paper trading follows a strategy forward from the end of the period you tested, with virtual capital and the same fees and slippage. It is how you find out whether a backtest survives contact with data it never saw."
          action={
            <Button variant="primary" asChild>
              <Link href="/lab/build">Test a strategy, then start paper trading</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  if (selected) {
    return (
      <PortfolioDetail
        portfolio={selected}
        onBack={() => router.push("/paper")}
        onChange={async (next: PaperPortfolio) => {
          await put(next);
        }}
        onDelete={async () => {
          await remove(selected.id);
          router.push("/paper");
        }}
      />
    );
  }

  return (
    <Panel>
      <ul className="divide-y divide-hairline">
        {sorted.map((p) => (
          <PortfolioRow key={p.id} portfolio={p} />
        ))}
      </ul>
    </Panel>
  );
}

function PortfolioRow({ portfolio: p }: { portfolio: PaperPortfolio }) {
  return (
    <li>
      <Link href={`/paper?id=${p.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-hover sm:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink group-hover:underline underline-offset-2">{p.name}</span>
            <SimulatedBadge />
            <Badge tone={p.status === "running" ? "annot" : "muted"}>{p.status === "running" ? "Running" : "Stopped"}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-3 leading-4">
            {STRATEGY_LIBRARY[p.config.params.kind].name} · {p.config.assets.join("+")} · {p.config.timeframe}
          </p>
        </div>
        <ChevronRight className="size-4 text-ink-3 sm:order-last" aria-hidden />
        <div className="text-xs sm:text-right">
          <span className="block text-2xs text-ink-3">Started</span>
          <span className="num text-ink-2">{fmtDate(p.startedAt)}</span>
        </div>
        <div className="text-xs sm:text-right">
          <span className="block text-2xs text-ink-3">Simulated clock</span>
          <span className={cn("num", p.status === "running" ? "text-ink-2" : "text-ink-3")}>{fmtDate(p.status === "stopped" && p.stoppedAt !== null ? p.stoppedAt : p.clock)}</span>
        </div>
        <div className="col-span-2 text-xs text-ink-3 sm:hidden">Virtual capital {fmtMoney(p.config.initialCapital, { currency: currencyOf(p.config.assets[0]) })}</div>
      </Link>
    </li>
  );
}
