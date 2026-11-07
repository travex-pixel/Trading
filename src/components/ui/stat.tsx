import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled figure. Not a card: a label over a mono value, separated from its
 * neighbours by spacing or a hairline, never by its own box.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  size = "md",
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "up" | "down" | "warn" | "muted";
  size?: "sm" | "md" | "lg";
  hint?: string;
  className?: string;
}) {
  const toneClass = { neutral: "text-ink", up: "text-up", down: "text-down", warn: "text-warn", muted: "text-ink-3" }[tone];
  const sizeClass = { sm: "text-base", md: "text-xl", lg: "text-3xl num-hero" }[size];
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-ink-3 leading-4" title={hint}>
        {label}
      </div>
      <div className={cn("mt-1 leading-none", size === "lg" ? "" : "num", sizeClass, toneClass)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink-3 leading-4">{sub}</div> : null}
    </div>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4", className)}>{children}</div>;
}
