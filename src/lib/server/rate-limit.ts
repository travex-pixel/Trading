import "server-only";

/**
 * Best-effort in-memory token bucket rate limiter for route handlers.
 * Per-instance on serverless; adequate for abuse damping on a demo and
 * replaceable with a shared store without changing callers.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export interface RateLimitOptions {
  /** Sustained requests per minute. */
  perMinute: number;
  /** Burst capacity. */
  burst: number;
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : (request.headers.get("x-real-ip") ?? "unknown");
  return ip.slice(0, 64);
}

export function rateLimit(key: string, options: RateLimitOptions): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const refillPerMs = options.perMinute / 60_000;
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_KEYS) buckets.clear();
    bucket = { tokens: options.burst, updatedAt: now };
    buckets.set(key, bucket);
  }
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(options.burst, bucket.tokens + elapsed * refillPerMs);
  bucket.updatedAt = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true, retryAfterSeconds: 0 };
  }
  return { ok: false, retryAfterSeconds: Math.ceil((1 - bucket.tokens) / refillPerMs / 1000) };
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}
