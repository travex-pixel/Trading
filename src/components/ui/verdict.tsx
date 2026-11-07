import { AlertTriangle, CheckCircle2, CircleHelp, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Finding, Verdict } from "@/lib/quant/validation";
import { VERDICT_LABELS } from "@/lib/quant/validation";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<Verdict, { icon: LucideIcon; cls: string }> = {
  unproven: { icon: CircleHelp, cls: "border-down/40 text-down bg-down-dim" },
  fragile: { icon: AlertTriangle, cls: "border-warn/40 text-warn bg-warn-dim" },
  promising: { icon: CheckCircle2, cls: "border-annot/40 text-annot bg-annot-dim" },
  robust: { icon: ShieldCheck, cls: "border-up/40 text-up bg-up-dim" },
};

export function VerdictBadge({ verdict, className, size = "md" }: { verdict: Verdict; className?: string; size?: "sm" | "md" }) {
  const { icon: Icon, cls } = VERDICT_STYLE[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border font-medium", size === "sm" ? "px-1.5 py-px text-2xs" : "px-2 py-0.5 text-xs", cls, className)}>
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2} aria-hidden />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

const SEVERITY: Record<Finding["severity"], { dot: string; label: string }> = {
  good: { dot: "bg-up", label: "Good" },
  info: { dot: "bg-annot", label: "Note" },
  warning: { dot: "bg-warn", label: "Warning" },
  critical: { dot: "bg-down", label: "Critical" },
};

export function FindingsList({ findings, className }: { findings: Finding[]; className?: string }) {
  if (findings.length === 0) return null;
  return (
    <ul className={cn("divide-y divide-hairline", className)}>
      {findings.map((f, i) => (
        <li key={i} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", SEVERITY[f.severity].dot)} aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink leading-5">
              <span className="sr-only">{SEVERITY[f.severity].label}: </span>
              {f.title}
            </div>
            <p className="mt-0.5 text-xs text-ink-2 leading-[1.15rem]">{f.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
