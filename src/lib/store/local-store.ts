/**
 * Browser-local persistence using localStorage, versioned and validated.
 *
 * Data written here never leaves the device. Reads are validated against the
 * schema so a tampered or stale entry cannot crash the app; invalid entries
 * are dropped rather than trusted.
 */

import { z } from "zod";
import { strategyConfigSchema } from "@/lib/strategies/schema";
import type { Competition, Experiment, Repository, Store } from "./types";
import type { PaperPortfolio } from "@/lib/quant/paper";

const STORAGE_VERSION = 1;
const PREFIX = `edgelab:v${STORAGE_VERSION}:`;

const metricsSchema = z.record(z.string(), z.union([z.number(), z.null()]));

const experimentSchema = z.object({
  id: z.string().min(1).max(64),
  lineageId: z.string().min(1).max(64),
  version: z.number().int().min(1),
  name: z.string().max(120),
  hypothesis: z.string().max(2000),
  config: strategyConfigSchema,
  dataset: z.object({ provider: z.string(), version: z.string(), label: z.string(), isSynthetic: z.boolean() }),
  period: z.object({ start: z.number(), end: z.number(), bars: z.number() }),
  timeframe: z.enum(["1h", "4h", "1d"]),
  assets: z.array(z.enum(["BTC", "ETH"])),
  result: z.object({
    metrics: metricsSchema,
    benchmark: z.object({ name: z.string(), metrics: metricsSchema }).nullable(),
    verdict: z.enum(["unproven", "fragile", "promising", "robust"]).nullable(),
    equity: z.array(z.object({ time: z.number(), equity: z.number() })).max(2000),
    warnings: z.array(z.string()).max(50),
  }),
  findings: z.string().max(5000),
  weaknesses: z.string().max(5000),
  createdAt: z.number(),
});

const portfolioSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120),
  config: strategyConfigSchema,
  startedAt: z.number(),
  clock: z.number(),
  status: z.enum(["running", "stopped"]),
  stoppedAt: z.number().nullable(),
  createdAt: z.number(),
  dataVersion: z.string(),
});

const competitionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120),
  rules: z.object({
    assets: z.array(z.enum(["BTC", "ETH"])).min(1),
    timeframe: z.enum(["1h", "4h", "1d"]),
    start: z.number(),
    end: z.number(),
    initialCapital: z.number(),
    feeBps: z.number(),
    slippageBps: z.number(),
  }),
  participants: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().max(80),
        kind: z.enum(["you", "seeded_bot", "invited"]),
        config: strategyConfigSchema,
      }),
    )
    .max(20),
  createdAt: z.number(),
  status: z.enum(["open", "completed"]),
});

function storage(): globalThis.Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

class LocalRepository<T extends { id: string }> implements Repository<T> {
  private cache: T[] | null = null;
  constructor(
    private readonly key: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  private load(): T[] {
    if (this.cache) return this.cache;
    const s = storage();
    if (!s) return [];
    try {
      const raw = s.getItem(PREFIX + this.key);
      if (!raw) return (this.cache = []);
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return (this.cache = []);
      const valid: T[] = [];
      for (const item of parsed) {
        const r = this.schema.safeParse(item);
        if (r.success) valid.push(r.data);
      }
      return (this.cache = valid);
    } catch {
      return (this.cache = []);
    }
  }

  private save(items: T[]): void {
    this.cache = items;
    const s = storage();
    if (!s) return;
    try {
      s.setItem(PREFIX + this.key, JSON.stringify(items));
    } catch {
      // Quota exceeded or storage disabled: keep working in memory.
    }
  }

  async list(): Promise<T[]> {
    return [...this.load()];
  }
  async get(id: string): Promise<T | null> {
    return this.load().find((x) => x.id === id) ?? null;
  }
  async put(item: T): Promise<void> {
    const parsed = this.schema.parse(item);
    const items = this.load().filter((x) => x.id !== parsed.id);
    items.push(parsed);
    this.save(items);
  }
  async remove(id: string): Promise<void> {
    this.save(this.load().filter((x) => x.id !== id));
  }
}

export function createLocalStore(): Store {
  return {
    backend: "browser",
    experiments: new LocalRepository<Experiment>("experiments", experimentSchema as unknown as z.ZodType<Experiment>),
    portfolios: new LocalRepository<PaperPortfolio>("portfolios", portfolioSchema as unknown as z.ZodType<PaperPortfolio>),
    competitions: new LocalRepository<Competition>("competitions", competitionSchema as unknown as z.ZodType<Competition>),
  };
}

/** Generate a short, URL-safe id. Uses crypto when available. */
export function newId(prefix = ""): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return prefix ? `${prefix}_${hex}` : hex;
}
