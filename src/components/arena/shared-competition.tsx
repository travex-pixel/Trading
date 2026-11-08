"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { describeRules } from "@/lib/arena/competition";
import type { CompetitionSnapshot } from "@/lib/arena/snapshot";
import { fmtDate } from "@/lib/format";
import { newId } from "@/lib/store/local-store";
import type { Competition } from "@/lib/store/types";
import { selectCompetitions, useRepository } from "@/lib/store/use-store";
import { Leaderboard, useStandings } from "./leaderboard";

export function SharedCompetition({ snapshot }: { snapshot: CompetitionSnapshot }) {
  const router = useRouter();
  const { put } = useRepository(selectCompetitions);
  const [saving, setSaving] = useState(false);

  // Rebuild a Competition object locally; ids are fresh because they only matter on this device.
  const competition = useMemo<Competition>(
    () => ({
      id: "shared",
      name: snapshot.name,
      rules: snapshot.rules,
      participants: snapshot.participants.map((p, i) => ({ id: `shared-${i}`, name: p.name, kind: p.kind, config: p.config })),
      createdAt: 0,
      status: "open",
    }),
    [snapshot],
  );
  const { standings, series, error, loading } = useStandings(competition);
  const versionMismatch = series ? series[0].source.version !== snapshot.data : false;

  const saveCopy = async () => {
    setSaving(true);
    const copy: Competition = { ...competition, id: newId("cmp"), participants: competition.participants.map((p) => ({ ...p, id: newId("pt") })), createdAt: Date.now() };
    await put(copy);
    router.push(`/arena/${copy.id}`);
  };

  return (
    <div>
      <PageHeader
        title={snapshot.name}
        description={
          <>
            A shared competition. Your browser re-ran every competitor on the same dataset version, so this board was reproduced here, not copied from the sender.
            <span className="num mt-1 block text-ink-3">
              {fmtDate(snapshot.rules.start)} – {fmtDate(snapshot.rules.end)} · {describeRules(snapshot.rules)}
            </span>
          </>
        }
        actions={
          <Button variant="primary" onClick={saveCopy} disabled={saving}>
            {saving ? "Saving…" : "Save a copy to my Arena"}
          </Button>
        }
      />
      {versionMismatch ? (
        <p className="mb-4 rounded-[var(--radius-md)] border border-warn/40 bg-warn-dim px-3 py-2 text-xs text-warn">
          This link was created on dataset version {snapshot.data}; you are seeing it on {series?.[0].source.version}. Results may differ from what the sender saw.
        </p>
      ) : null}
      <Leaderboard competition={competition} standings={standings} series={series} error={error} loading={loading} />
    </div>
  );
}
