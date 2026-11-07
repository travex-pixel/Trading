import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 px-4 py-8", className)}>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {body ? <p className="max-w-[48ch] text-sm text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action, className }: { title?: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-[var(--radius-md)] border border-down/30 bg-down-dim px-4 py-3", className)}>
      <div className="text-sm font-medium text-down">{title}</div>
      {body ? <p className="mt-1 text-xs text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--radius-sm)] bg-raised", className)} />;
}
