"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Flag, LinkSimple, Trash } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { PageHeader, Panel } from "@/components/ui/panel";
import { encodeCompetitionSnapshot, snapshotFromCompetition } from "@/lib/arena/snapshot";
import { describeRules } from "@/lib/arena/competition";
import { fmtDate } from "@/lib/format";
import { selectCompetitions, useRepository } from "@/lib/store/use-store";
import { Leaderboard, useStandings } from "./leaderboard";

export function CompetitionView({ id }: { id: string }) {
  const { items, loading, put, remove } = useRepository(selectCompetitions);
  const router = useRouter();
  const competition = useMemo(() => items?.find((c) => c.id === id) ?? null, [items, id]);
  const { standings, series, error, loading: runLoading } = useStandings(competition);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const share = useCallback(async () => {
    if (!competition || !series) return;
    try {
      const code = encodeCompetitionSnapshot(snapshotFromCompetition(competition, series[0].source.version));
      const url = `${window.location.origin}/arena/s/${code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage("Link copied. Anyone who opens it re-runs every competitor on the same dataset version.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create the link.");
    }
  }, [competition, series]);

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!competition) {
    return (
      <div>
        <PageHeader title="Competition not found" />
        <Panel>
          <EmptyState
            title="This competition is not on this device"
            body="Competitions are stored in your browser. If someone sent you a link, open their share link instead."
            action={
              <Button asChild variant="primary">
                <Link href="/arena">Back to the Arena</Link>
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  const toggleStatus = () => put({ ...competition, status: competition.status === "open" ? "completed" : "open" });
  const del = async () => {
    if (!window.confirm(`Delete "${competition.name}"? This cannot be undone.`)) return;
    await remove(competition.id);
    router.push("/arena");
  };

  return (
    <div>
      <PageHeader
        title={competition.name}
        description={
          <span className="num">
            {fmtDate(competition.rules.start)} – {fmtDate(competition.rules.end)} · {describeRules(competition.rules)}
            <Badge tone={competition.status === "open" ? "annot" : "muted"} className="ml-2 align-middle">
              {competition.status === "open" ? "Open" : "Completed"}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={share} disabled={!series}>
              {copied ? <Check className="size-3.5 text-up" aria-hidden /> : <LinkSimple className="size-3.5" aria-hidden />} {copied ? "Link copied" : "Share link"}
            </Button>
            <Button size="sm" onClick={toggleStatus}>
              <Flag className="size-3.5" aria-hidden /> {competition.status === "open" ? "Mark completed" : "Reopen"}
            </Button>
            <Button size="sm" variant="danger" onClick={del}>
              <Trash className="size-3.5" aria-hidden /> Delete
            </Button>
          </>
        }
      />
      {message ? (
        <p role="status" className="mb-4 text-xs text-annot">
          {message}
        </p>
      ) : null}
      <Leaderboard competition={competition} standings={standings} series={series} error={error} loading={runLoading} />
    </div>
  );
}
