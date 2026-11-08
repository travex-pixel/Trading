import { CALENDARS, marketStatus, tzLabel } from "@/lib/market/calendar";
import { MARKET_ORDER, MARKETS } from "@/lib/market/instruments";
import { providerStatus } from "@/lib/market/provider";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * What data the server can provide right now, per market, and whether each
 * market is open. Never reveals keys; only whether a provider is configured.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`status:${clientKey(request)}`, { perMinute: 60, burst: 20 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);
  const now = Date.now();
  const status = providerStatus();
  const markets = MARKET_ORDER.map((id) => ({
    id,
    name: MARKETS[id].name,
    shortName: MARKETS[id].shortName,
    currency: MARKETS[id].currency,
    status: MARKETS[id].status,
    timezone: CALENDARS[id].timezone,
    tz: tzLabel(id, now),
    session: CALENDARS[id].session,
    open: marketStatus(id, now),
    data: status.perMarket[id],
  }));
  return Response.json({ now, markets, providers: status.providers }, { headers: { "Cache-Control": "no-store" } });
}
