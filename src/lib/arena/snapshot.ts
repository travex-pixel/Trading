/**
 * Shareable competition links: the competition's name, rules and every
 * participant's configuration encoded into a URL. The recipient's browser
 * re-runs all participants on the same dataset version, so the leaderboard
 * is reproduced, not transmitted. Validated strictly on decode.
 */

import { z } from "zod";
import { strategyConfigSchema } from "@/lib/strategies/schema";
import type { Competition } from "@/lib/store/types";

export const competitionSnapshotSchema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(120),
  rules: z.object({
    assets: z.array(z.enum(["BTC", "ETH"])).min(1).max(2),
    timeframe: z.enum(["1h", "4h", "1d"]),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    initialCapital: z.number().min(100).max(1_000_000_000),
    feeBps: z.number().min(0).max(500),
    slippageBps: z.number().min(0).max(500),
  }),
  participants: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        kind: z.enum(["you", "seeded_bot", "invited"]),
        config: strategyConfigSchema,
      }),
    )
    .min(1)
    .max(8),
  /** Dataset version the competition was created on. */
  data: z.string().max(64),
});

export type CompetitionSnapshot = z.infer<typeof competitionSnapshotSchema>;

export const MAX_COMPETITION_SNAPSHOT_LENGTH = 8192;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function snapshotFromCompetition(c: Competition, dataVersion: string): CompetitionSnapshot {
  return {
    v: 1,
    name: c.name,
    rules: c.rules,
    participants: c.participants.map((p) => ({ name: p.name, kind: p.kind, config: p.config })),
    data: dataVersion,
  };
}

export function encodeCompetitionSnapshot(snapshot: CompetitionSnapshot): string {
  const encoded = toBase64Url(JSON.stringify(competitionSnapshotSchema.parse(snapshot)));
  if (encoded.length > MAX_COMPETITION_SNAPSHOT_LENGTH) throw new Error("Competition too large to share as a link.");
  return encoded;
}

export function decodeCompetitionSnapshot(encoded: string): { ok: true; snapshot: CompetitionSnapshot } | { ok: false; error: string } {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > MAX_COMPETITION_SNAPSHOT_LENGTH) {
    return { ok: false, error: "This link is malformed." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return { ok: false, error: "This link contains invalid characters." };
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(encoded));
    const result = competitionSnapshotSchema.safeParse(parsed);
    if (!result.success) return { ok: false, error: "This link does not describe a valid competition." };
    return { ok: true, snapshot: result.data };
  } catch {
    return { ok: false, error: "This link could not be read." };
  }
}
