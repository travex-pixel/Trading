import { ruleBasedReview } from "@/lib/ai/analysts";
import { claudeReview, llmEnabled } from "@/lib/ai/llm";
import { reviewRequestSchema, type AIReview } from "@/lib/ai/schema";
import { runLab } from "@/lib/lab/run";
import { getAlignedSeries } from "@/lib/market/provider";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const limited = rateLimit(`ai:${clientKey(request)}`, { perMinute: 10, burst: 5 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return Response.json({ error: "Request too large." }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid review request.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  const { config, period, validate } = parsed.data;

  try {
    // The server recomputes the result from the configuration so the assistant
    // can never be fed fabricated figures.
    const series = await getAlignedSeries(config.assets, config.timeframe);
    const run = runLab(config, series, period, { validate, folds: 4 });
    const ruleBased = ruleBasedReview(run);
    let review: AIReview = ruleBased;
    let note: string | null = null;
    if (llmEnabled()) {
      try {
        review = await claudeReview(run, ruleBased);
      } catch (err) {
        note = err instanceof Error ? `Claude review unavailable (${err.message}). Showing the rule-based analysis.` : "Claude review unavailable. Showing the rule-based analysis.";
      }
    }
    return Response.json({ review, note, llmConfigured: llmEnabled() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Review failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
