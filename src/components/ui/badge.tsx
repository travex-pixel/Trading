import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "up" | "down" | "warn" | "annot" | "muted";

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-border text-ink-2",
    up: "border-up/40 text-up bg-up-dim",
    down: "border-down/40 text-down bg-down-dim",
    warn: "border-warn/40 text-warn bg-warn-dim",
    annot: "border-annot/40 text-annot bg-annot-dim",
    muted: "border-hairline text-ink-3",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-px text-2xs font-medium leading-4 whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warn" className={cn("font-mono tracking-wide", className)} title="Simulated. No real orders are placed.">
      SIMULATED
    </Badge>
  );
}
