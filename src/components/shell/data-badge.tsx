/**
 * The data provenance badge. Server component: it reads the configured
 * provider name on the server so the browser never learns anything else
 * about provider configuration.
 */
import { providerStatus } from "@/lib/market/provider";

export function DataBadge({ compact = false }: { compact?: boolean }) {
  const status = providerStatus();
  const demo = status.perMarket.ASX.isSynthetic;
  // With a provider configured, the badge states the connection, not the data:
  // a plan may not cover every instrument, and those charts fall back to demo
  // data with their own label. Each chart's provenance plate is the truth.
  const provider = status.perMarket.ASX.provider.toUpperCase();
  const label = demo
    ? compact
      ? "DEMO DATA"
      : "DEMO DATA — NOT LIVE MARKET DATA"
    : compact
      ? `${provider} CONNECTED`
      : `${provider} connected · each chart states its source`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-mono text-2xs tracking-wide ${
        demo ? "border-warn/40 text-warn" : "border-up/40 text-up"
      }`}
      title={
        demo
          ? "Deterministic synthetic dataset. Nothing shown is real market data."
          : `${status.perMarket.ASX.label}. Instruments outside the plan fall back to labelled demo data.`
      }
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${demo ? "bg-warn" : "bg-up"}`}
      />
      {label}
    </span>
  );
}
