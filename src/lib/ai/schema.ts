/**
 * Schemas for the research assistant. Every analyst output, whether produced
 * by deterministic code or by a language model, must satisfy these schemas
 * before the UI renders it.
 */

import { z } from "zod";
import { strategyConfigSchema } from "@/lib/strategies/schema";

export const analystRoleSchema = z.enum(["research", "technical", "quant", "risk", "reviewer"]);
export type AnalystRole = z.infer<typeof analystRoleSchema>;

export const ANALYST_LABELS: Record<AnalystRole, { title: string; job: string }> = {
  research: { title: "Research analyst", job: "Proposes hypotheses worth testing next." },
  technical: { title: "Technical analyst", job: "Reads how the rules interacted with price behaviour." },
  quant: { title: "Quant researcher", job: "Judges whether the evidence supports the result." },
  risk: { title: "Risk analyst", job: "Looks at drawdowns, streaks, exposure and costs." },
  reviewer: { title: "Independent reviewer", job: "Argues against the conclusion." },
};

/** A statement carries its epistemic status so the UI can separate evidence from speculation. */
export const statementSchema = z.object({
  kind: z.enum(["evidence", "speculation"]),
  text: z.string().min(1).max(400),
});

export const analystNoteSchema = z.object({
  role: analystRoleSchema,
  statements: z.array(statementSchema).min(1).max(6),
});

/** A concrete, applicable change to the strategy configuration. */
export const suggestedExperimentSchema = z.object({
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(400),
  /** Parameter patch keyed by the strategy's own parameter names. Validated against the config when applied. */
  paramPatch: z.record(z.string(), z.number()).optional(),
  riskPatch: z
    .object({
      stopLossPct: z.number().min(0.001).max(0.9).nullable().optional(),
      takeProfitPct: z.number().min(0.001).max(10).nullable().optional(),
    })
    .optional(),
  timeframe: z.enum(["1h", "4h", "1d"]).optional(),
});
export type SuggestedExperiment = z.infer<typeof suggestedExperimentSchema>;

export const aiReviewSchema = z.object({
  /** Two or three sentences a non-quant understands. */
  summary: z.string().min(1).max(800),
  analysts: z.array(analystNoteSchema).min(1).max(5),
  limitations: z.array(z.string().min(1).max(300)).max(6),
  experiments: z.array(suggestedExperimentSchema).max(5),
  /** How confident the assistant is that an edge exists, in words. */
  confidence: z.enum(["none", "low", "moderate", "high"]),
  /** Where this review came from. */
  provenance: z.object({
    mode: z.enum(["rule_based", "claude"]),
    model: z.string().max(80).nullable(),
    dataset: z.string().max(80),
    period: z.object({ start: z.number(), end: z.number() }),
  }),
});
export type AIReview = z.infer<typeof aiReviewSchema>;

/** What the model is allowed to produce. Provenance is stamped by the server, never by the model. */
export const llmReviewOutputSchema = aiReviewSchema.omit({ provenance: true });
export type LLMReviewOutput = z.infer<typeof llmReviewOutputSchema>;

export const reviewRequestSchema = z.object({
  config: strategyConfigSchema,
  period: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
  /** Run the slow validation suite on the server before reviewing. */
  validate: z.boolean().default(false),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
