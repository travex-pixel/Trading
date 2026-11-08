import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A panel is a ruled region, not a floating card. Hairline border, flat
 * surface, a header row that reads like a drawing-sheet title.
 */
export function Panel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-[var(--radius-md)] border border-hairline bg-panel", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  aside,
  className,
  as: Heading = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <header className={cn("flex items-start justify-between gap-4 px-4 pt-3.5 pb-3 border-b border-hairline", className)}>
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-ink leading-5">{title}</Heading>
        {description ? <p className="mt-0.5 text-xs text-ink-3 leading-4">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0 flex items-center gap-2">{aside}</div> : null}
    </header>
  );
}

export function PanelBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-4 py-3.5", className)} {...props}>
      {children}
    </div>
  );
}

/** Page heading row. */
export function PageHeader({ title, description, actions, className }: { title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[62ch] text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
