import { z } from "zod";
import { getAlignedSeries, marketDataProvider } from "@/lib/market/provider";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import type { CandleSeries } from "@/lib/quant/types";

const querySchema = z.object({
  assets: z
    .string()
    .transform((s) => s.split(",").map((a) => a.trim().toUpperCase()))
    .pipe(z.array(z.enum(["BTC", "ETH"])).min(1).max(2)),
  timeframe: z.enum(["1h", "4h", "1d"]),
});

/** Columnar encoding roughly halves the payload compared with an array of objects. */
export interface ColumnarSeries {
  asset: CandleSeries["asset"];
  timeframe: CandleSeries["timeframe"];
  source: CandleSeries["source"];
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export function toColumnar(series: CandleSeries): ColumnarSeries {
  const n = series.candles.length;
  const t = new Array<number>(n), o = new Array<number>(n), h = new Array<number>(n), l = new Array<number>(n), c = new Array<number>(n), v = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const k = series.candles[i];
    t[i] = k.time; o[i] = k.open; h[i] = k.high; l[i] = k.low; c[i] = k.close; v[i] = k.volume;
  }
  return { asset: series.asset, timeframe: series.timeframe, source: series.source, t, o, h, l, c, v };
}

export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request), { perMinute: 60, burst: 20 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ assets: url.searchParams.get("assets") ?? "", timeframe: url.searchParams.get("timeframe") ?? "" });
  if (!parsed.success) {
    return Response.json({ error: "Invalid query. Use assets=BTC,ETH and timeframe=1h|4h|1d." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const { assets, timeframe } = parsed.data;
  try {
    const series = await getAlignedSeries(assets, timeframe);
    const isDemo = marketDataProvider().name === "demo" && series.every((s) => s.source.provider === "demo");
    // Demo data is deterministic and versioned, so it can be cached aggressively.
    const cacheControl = isDemo ? "public, max-age=86400, s-maxage=604800, immutable" : "public, max-age=300, s-maxage=300";
    return Response.json({ series: series.map(toColumnar) }, { headers: { "Cache-Control": cacheControl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Market data unavailable.";
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
