import { z } from "zod";
import { isInstrumentId } from "@/lib/market/instruments";
import { eodhdToken, getQuotes } from "@/lib/market/provider";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

const querySchema = z
  .string()
  .max(400)
  .transform((s) => s.split(",").map((a) => a.trim().toUpperCase()).filter(Boolean))
  .pipe(z.array(z.string().refine(isInstrumentId, { message: "Unknown instrument." })).min(1).max(12));

/**
 * Latest quotes from the live/delayed provider. Returns an empty list, not
 * fabricated prices, when no provider is configured; the UI then shows the
 * last historical close and says so.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`quotes:${clientKey(request)}`, { perMinute: 30, burst: 10 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(url.searchParams.get("ids") ?? "");
  if (!parsed.success) return Response.json({ error: "Invalid ids." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (!eodhdToken()) return Response.json({ quotes: [], configured: false }, { headers: { "Cache-Control": "no-store" } });
  const quotes = await getQuotes(parsed.data);
  return Response.json({ quotes, configured: true }, { headers: { "Cache-Control": "private, max-age=60" } });
}
