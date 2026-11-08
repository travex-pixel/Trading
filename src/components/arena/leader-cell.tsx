"use client";

import { Skeleton } from "@/components/ui/empty";
import { fmtNum, fmtPct, signClass } from "@/lib/format";
import type { Competition } from "@/lib/store/types";
import { cn } from "@/lib/utils";
import { KindBadge, useStandings } from "./leaderboard";

/** Current leader of a competition, computed on the fly for the list page. */
export function LeaderCell({ competition }: { competition: Competition }) {
  const { standings, loading } = useStandings(competition);
  if (loading || !standings) return <Skeleton className="h-8 w-40" />;
  const leader = standings[0];
  if (!leader?.result) return <span className="text-xs text-ink-3">No results.</span>;
  const m = leader.result.metrics;
  return (
    <div className="sm:text-right">
      <div className="flex items-center gap-1.5 text-xs text-ink-3 sm:justify-end">
        Leader <KindBadge kind={leader.participant.kind} />
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 sm:justify-end">
        <span className="text-sm text-ink">{leader.participant.name}</span>
        <span className={cn("num text-xs", signClass(m.totalReturnPct))}>{fmtPct(m.totalReturnPct, { sign: true })}</span>
        <span className="num text-xs text-ink-3">{leader.score === null ? "" : `· ${fmtNum(leader.score)}`}</span>
      </div>
    </div>
  );
}
