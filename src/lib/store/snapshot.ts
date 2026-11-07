/**
 * Shareable snapshots: a strategy configuration plus period encoded into a
 * URL so results can be shared with no backend. The recipient's browser
 * re-runs the deterministic backtest on the same dataset version, so what
 * they see is reproduced, not transmitted.
 *
 * The payload is validated on decode; anything that fails validation is
 * rejected outright.
 */

import { z } from "zod";
import { strategyConfigSchema } from "@/lib/strategies/schema";

export const snapshotSchema = z.object({
  v: z.literal(1),
  config: strategyConfigSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  /** Dataset version the snapshot was produced on. */
  data: z.string().max(64),
  title: z.string().max(120).optional(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

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

export const MAX_SNAPSHOT_LENGTH = 4096;

export function encodeSnapshot(snapshot: Snapshot): string {
  const encoded = toBase64Url(JSON.stringify(snapshotSchema.parse(snapshot)));
  if (encoded.length > MAX_SNAPSHOT_LENGTH) throw new Error("Snapshot too large.");
  return encoded;
}

export function decodeSnapshot(encoded: string): { ok: true; snapshot: Snapshot } | { ok: false; error: string } {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > MAX_SNAPSHOT_LENGTH) {
    return { ok: false, error: "This link is malformed." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return { ok: false, error: "This link contains invalid characters." };
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(encoded));
    const result = snapshotSchema.safeParse(parsed);
    if (!result.success) return { ok: false, error: "This link does not describe a valid experiment." };
    return { ok: true, snapshot: result.data };
  } catch {
    return { ok: false, error: "This link could not be read." };
  }
}
