"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { demoCompetition, describeRules } from "@/lib/arena/competition";
import { fmtDate } from "@/lib/format";
import { fetchCandles } from "@/lib/market/client";
import { DEFAULT_MARKET, rotationPair } from "@/lib/market/instruments";
import { selectCompetitions, useRepository } from "@/lib/store/use-store";
import type { Competition } from "@/lib/store/types";
import { LeaderCell } from "./leader-cell";

export function CompetitionList() {
  const { items, loading, put } = useRepository(selectCompetitions);
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(() => (items ? [...items].sort((a, b) => b.createdAt - a.createdAt) : []), [items]);
  const open = sorted.filter((c) => c.status === "open");
  const completed = sorted.filter((c) => c.status === "completed");

  const createDemo = async () => {
    setCreating(true);
    try {
      const pair = rotationPair(DEFAULT_MARKET);
      const series = await fetchCandles([...pair], "1d");
      const ref = series[0].candles;
      const comp = demoCompetition(ref[0].time, ref[ref.length - 1].time, DEFAULT_MARKET);
      await put(comp);
      router.push(`/arena/${comp.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (sorted.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No competitions yet"
          body="A competition runs several strategies on exactly the same market, dates, capital and costs, then ranks them by return earned per unit of risk. Start with the demo to see the seeded bots fight, or create your own and invite friends with a link."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={createDemo} disabled={creating}>
                <Swords className="size-4" aria-hidden /> {creating ? "Setting up…" : "Create demo competition"}
              </Button>
              <Button asChild>
                <Link href="/arena/new">
                  <Plus className="size-4" aria-hidden /> Create your own
                </Link>
              </Button>
            </div>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Section title="Open" items={open} empty="No open competitions." />
      <Section title="Completed" items={completed} empty="Nothing completed yet. Mark a competition completed from its page once the dust has settled." />
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={createDemo} disabled={creating}>
          <Swords className="size-3.5" aria-hidden /> {creating ? "Setting up…" : "Add another demo competition"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, items, empty }: { title: string; items: Competition[]; empty: string }) {
  return (
    <Panel>
      <PanelHeader title={`${title} (${items.length})`} />
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/arena/${c.id}`} className="group grid gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-hover sm:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-ink group-hover:underline underline-offset-2">{c.name}</h3>
                    <Badge tone="muted">
                      {c.participants.length} competitor{c.participants.length === 1 ? "" : "s"}
                    </Badge>
                    {c.participants.some((p) => p.kind === "seeded_bot") ? <Badge tone="muted">{c.participants.filter((p) => p.kind === "seeded_bot").length} bots</Badge> : null}
                  </div>
                  <p className="num mt-1 text-xs text-ink-3">
                    {fmtDate(c.rules.start)} – {fmtDate(c.rules.end)} · {describeRules(c.rules)}
                  </p>
                </div>
                <LeaderCell competition={c} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
