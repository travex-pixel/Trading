import type { ReactNode } from "react";
import type { DataSource } from "@/lib/quant/types";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The provenance plate: the signature move. A ruled strip under every chart
 * and result stating where the numbers came from, like a drawing's title
 * block. Dataset · period · costs · execution · version.
 */
export function ProvenancePlate({
  source,
  period,
  feeBps,
  slippageBps,
  bars,
  timeframe,
  extra,
  className,
}: {
  source: DataSource;
  period?: { start: number; end: number };
  feeBps?: number;
  slippageBps?: number;
  bars?: number;
  timeframe?: string;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 font-mono text-2xs leading-4 text-ink-3",
        className,
      )}
    >
      <Cell label="Data" value={source.isSynthetic ? "DEMO · synthetic" : source.label} emphasis={source.isSynthetic ? "warn" : undefined} />
      <Cell label="Ver" value={source.version} />
      {period ? <Cell label="Period" value={`${fmtDate(period.start)} – ${fmtDate(period.end)}`} /> : null}
      {timeframe ? <Cell label="Bars" value={`${bars ?? "–"} × ${timeframe}`} /> : null}
      {feeBps !== undefined ? <Cell label="Costs" value={`${feeBps}bp fee · ${slippageBps ?? 0}bp slip`} /> : null}
      <Cell label="Fills" value="next open" />
      {extra}
    </dl>
  );
}

export function Cell({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: "warn" | "up" | "down" }) {
  const cls = emphasis === "warn" ? "text-warn" : emphasis === "up" ? "text-up" : emphasis === "down" ? "text-down" : "text-ink-2";
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <dt className="uppercase tracking-wider text-ink-4">{label}</dt>
      <dd className={cls}>{value}</dd>
    </div>
  );
}
