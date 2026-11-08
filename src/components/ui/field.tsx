"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-2 leading-4">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-2xs text-ink-3 leading-4">{hint}</p> : null}
    </div>
  );
}

const control = "h-9 w-full rounded-[var(--radius-md)] border border-border bg-raised px-2.5 text-sm text-ink placeholder:text-ink-4 hover:border-border-strong focus:border-annot focus:outline-none transition-colors";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, "appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, props.type === "number" ? "num" : "", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "h-auto min-h-20 py-2 leading-5 resize-y", className)} {...props} />;
}

/** A numeric control that shows its value in mono and accepts direct typing. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  unit,
  className,
}: {
  id: string;
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: ReactNode;
  unit?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-0 min-w-12 flex-1 cursor-pointer"
          aria-label={typeof label === "string" ? label : undefined}
        />
        <div className="flex w-24 shrink-0 items-center">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className={cn(control, "num h-8 min-w-0 flex-1 px-2 text-xs text-right", unit ? "rounded-r-none" : "")}
            aria-label={`${typeof label === "string" ? label : "value"} (exact)`}
          />
          {unit ? <span className="flex h-8 shrink-0 items-center rounded-r-[var(--radius-md)] border border-l-0 border-border bg-raised px-1.5 text-2xs text-ink-3">{unit}</span> : null}
        </div>
      </div>
    </Field>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[var(--radius-md)] border border-border bg-raised p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[3px] font-medium transition-colors disabled:opacity-40",
              size === "sm" ? "h-6 px-2 text-2xs" : "h-7 px-2.5 text-xs",
              active ? "bg-ink text-ground" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
