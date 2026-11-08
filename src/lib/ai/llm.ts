import "server-only";

/**
 * Optional language-model layer for the research assistant.
 *
 * Enabled only when ANTHROPIC_API_KEY is set on the server. The model is given
 * the deterministic analysts' output and a number-complete brief of the run,
 * and must answer in a fixed schema. Provenance is stamped by the server. The
 * model never receives raw user text as instructions, never sees credentials,
 * and cannot call tools.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { LabRun } from "@/lib/lab/run";
import { runBrief } from "./analysts";
import { llmReviewOutputSchema, type AIReview } from "./schema";

export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function configuredModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
}

const SYSTEM = `You are the research assistant inside EdgeLab, a quantitative trading research tool. You review a backtest for a careful amateur.

Rules you must follow:
- Use only the numbers in the brief. Never invent market data, performance figures, dates or statistics. If a figure is not in the brief, say it is not available.
- Separate evidence (computed from the data) from speculation (your interpretation). Tag every statement.
- Cite the dataset and period in the summary. If the dataset is synthetic, say that nothing here is a tradable edge.
- State assumptions and limitations. Highlight uncertainty. Never promise or imply future profitability.
- Suggested experiments must be concrete and small: one parameter change, one risk change, or one timeframe change each, using the strategy's own parameter names from the brief.
- Plain English first. Introduce a technical term only with a short explanation.
- A higher return does not make a strategy better. Weigh risk, sample size and out-of-sample evidence.`;

export async function claudeReview(run: LabRun, ruleBased: AIReview): Promise<AIReview> {
  const client = new Anthropic();
  const model = configuredModel();
  const brief = runBrief(run);
  const prior = JSON.stringify({ analysts: ruleBased.analysts, experiments: ruleBased.experiments, limitations: ruleBased.limitations });

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Review this backtest.\n\nBRIEF (the only numbers you may use):\n${brief}\n\nDETERMINISTIC ANALYST NOTES (computed by code; you may refine, reorder or challenge them, but not contradict the figures):\n${prior}`,
      },
    ],
    output_config: { format: zodOutputFormat(llmReviewOutputSchema) },
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to review this request.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The model's answer did not match the review schema.");
  // Validate again on our side; the SDK helper already parsed, but the schema is our contract.
  const validated = llmReviewOutputSchema.parse(parsed);
  return { ...validated, provenance: { mode: "claude", model: response.model, dataset: run.result.source.version, period: run.result.period } };
}
