/**
 * Persistence model. Everything the user creates is stored through a
 * repository interface so the default browser-local store and an optional
 * remote store (Supabase) are interchangeable.
 */

import type { PaperPortfolio } from "@/lib/quant/paper";
import type { AssetId, PerformanceMetrics, Timeframe } from "@/lib/quant/types";
import type { Verdict } from "@/lib/quant/validation";
import type { StrategyConfig } from "@/lib/strategies/schema";

export interface ExperimentResultSummary {
  metrics: PerformanceMetrics;
  benchmark: { name: string; metrics: PerformanceMetrics } | null;
  verdict: Verdict | null;
  /** Downsampled equity for sparklines and journal charts. */
  equity: Array<{ time: number; equity: number }>;
  warnings: string[];
}

export interface Experiment {
  id: string;
  /** Groups versions of the same idea. */
  lineageId: string;
  version: number;
  name: string;
  hypothesis: string;
  config: StrategyConfig;
  dataset: { provider: string; version: string; label: string; isSynthetic: boolean };
  period: { start: number; end: number; bars: number };
  timeframe: Timeframe;
  assets: AssetId[];
  result: ExperimentResultSummary;
  findings: string;
  weaknesses: string;
  createdAt: number;
}

export interface CompetitionParticipant {
  id: string;
  /** Display name. Seeded demo participants are flagged so they are never mistaken for people. */
  name: string;
  kind: "you" | "seeded_bot" | "invited";
  config: StrategyConfig;
}

export interface Competition {
  id: string;
  name: string;
  /** Shared rules every participant runs under. */
  rules: {
    assets: AssetId[];
    timeframe: Timeframe;
    start: number;
    end: number;
    initialCapital: number;
    feeBps: number;
    slippageBps: number;
    /** Flat brokerage per order; optional for competitions saved before it existed. */
    feeFixed?: number;
  };
  participants: CompetitionParticipant[];
  createdAt: number;
  status: "open" | "completed";
}

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface Store {
  experiments: Repository<Experiment>;
  portfolios: Repository<PaperPortfolio>;
  competitions: Repository<Competition>;
  /** Where data lives, for the UI's honesty label. */
  backend: "browser" | "supabase";
}
