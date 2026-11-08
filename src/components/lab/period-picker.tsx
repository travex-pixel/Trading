"use client";

import { Field, Input, Segmented } from "@/components/ui/field";
import type { Period } from "@/lib/quant/validation";
import { HOLDOUT_DAYS } from "@/lib/lab/run";

export type PeriodPreset = "6m" | "1y" | "2y" | "all" | "custom";

function toInputDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Presets end HOLDOUT_DAYS before the latest bar so the most recent data stays unseen for paper trading; "All" uses everything. */
export function presetPeriod(preset: Exclude<PeriodPreset, "custom">, dataStart: number, dataEnd: number): Period {
  const day = 86_400_000;
  if (preset === "all") return { start: dataStart, end: dataEnd };
  const end = Math.max(dataStart + day, dataEnd - HOLDOUT_DAYS * day);
  const months = preset === "6m" ? 6 : preset === "1y" ? 12 : 24;
  const start = Math.max(dataStart, end - months * 30.44 * day);
  return { start, end };
}

export function detectPreset(period: Period, dataStart: number, dataEnd: number): PeriodPreset {
  for (const p of ["6m", "1y", "2y", "all"] as const) {
    const q = presetPeriod(p, dataStart, dataEnd);
    if (Math.abs(q.start - period.start) < 86_400_000 && Math.abs(q.end - period.end) < 86_400_000) return p;
  }
  return "custom";
}

export function PeriodPicker({
  period,
  onChange,
  dataStart,
  dataEnd,
  compact = false,
}: {
  period: Period;
  onChange: (p: Period) => void;
  dataStart: number;
  dataEnd: number;
  compact?: boolean;
}) {
  const preset = detectPreset(period, dataStart, dataEnd);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Period" hint={compact ? undefined : `Presets stop ${HOLDOUT_DAYS} days before the latest bar, keeping recent data unseen for paper trading.`}>
        <Segmented<PeriodPreset>
          label="Period"
          size={compact ? "sm" : "md"}
          value={preset}
          onChange={(p) => {
            if (p === "custom") return;
            onChange(presetPeriod(p, dataStart, dataEnd));
          }}
          options={[
            { value: "6m", label: "6m" },
            { value: "1y", label: "1y" },
            { value: "2y", label: "2y" },
            { value: "all", label: "All" },
            { value: "custom", label: "Custom", disabled: preset !== "custom" },
          ]}
        />
      </Field>
      {!compact ? (
        <>
          <Field label="From" htmlFor="from">
            <Input
              id="from"
              type="date"
              className="h-8 w-[150px] text-xs"
              value={toInputDate(period.start)}
              min={toInputDate(dataStart)}
              max={toInputDate(period.end)}
              onChange={(e) => {
                const v = Date.parse(e.target.value + "T00:00:00Z");
                if (Number.isFinite(v) && v < period.end) onChange({ start: Math.max(dataStart, v), end: period.end });
              }}
            />
          </Field>
          <Field label="To" htmlFor="to">
            <Input
              id="to"
              type="date"
              className="h-8 w-[150px] text-xs"
              value={toInputDate(period.end)}
              min={toInputDate(period.start)}
              max={toInputDate(dataEnd)}
              onChange={(e) => {
                const v = Date.parse(e.target.value + "T23:59:59Z");
                if (Number.isFinite(v) && v > period.start) onChange({ start: period.start, end: Math.min(dataEnd, v) });
              }}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}
