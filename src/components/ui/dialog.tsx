"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * A sheet on phones, a centred dialog on larger screens. The body scrolls
 * inside the sheet so the page behind never moves.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  size = "md",
  footer,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        className={cn(
          "quiz-enter flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-border bg-panel shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:rounded-[var(--radius-lg)]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id="dlg-title" className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs leading-4 text-ink-3">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink-2 hover:bg-hover hover:text-ink">
            <X className="size-4" weight="bold" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? <div className="border-t border-hairline px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">{footer}</div> : null}
      </div>
    </div>
  );
}
