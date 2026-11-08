"use client";

/**
 * Market selector plus searchable instrument picker. Shows ticker, name,
 * exchange and currency so a user always knows what they are testing and in
 * which money. Only markets the product genuinely supports are listed.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/field";
import { getInstrument, instrumentsFor, MARKET_ORDER, MARKETS, searchInstruments, type Instrument, type MarketId } from "@/lib/market/instruments";
import { cn } from "@/lib/utils";

export function MarketSelector({ value, onChange, size = "md", className }: { value: MarketId; onChange: (m: MarketId) => void; size?: "sm" | "md"; className?: string }) {
  return (
    <Segmented<MarketId>
      label="Market"
      size={size}
      value={value}
      onChange={onChange}
      className={className}
      options={MARKET_ORDER.filter((m) => MARKETS[m].status === "operational").map((m) => ({ value: m, label: MARKETS[m].shortName }))}
    />
  );
}

export function InstrumentRow({ instrument, compact = false }: { instrument: Instrument; compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="num shrink-0 font-semibold text-ink">{instrument.symbol}</span>
      <span className={cn("min-w-0 truncate text-ink-2", compact ? "text-xs" : "text-sm")}>{instrument.name}</span>
      <span className="num ml-auto shrink-0 text-2xs text-ink-3">
        {instrument.exchange} · {instrument.currency}
      </span>
    </span>
  );
}

/**
 * Single or multiple selection. `max` above 1 allows a basket (for rotation
 * strategies); all picks must share the current market.
 */
export function InstrumentPicker({
  value,
  onChange,
  market,
  onMarketChange,
  max = 1,
  min = 1,
  label = "Instrument",
  className,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  market: MarketId;
  onMarketChange?: (m: MarketId) => void;
  max?: number;
  min?: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchInstruments(query, market), [query, market]);
  const selected = value.map((id) => getInstrument(id)).filter((i): i is Instrument => i !== null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const toggle = (id: string) => {
    if (max === 1) {
      onChange([id]);
      setOpen(false);
      setQuery("");
      return;
    }
    if (value.includes(id)) {
      if (value.length > min) onChange(value.filter((v) => v !== id));
    } else if (value.length < max) {
      onChange([...value, id]);
    }
  };

  const switchMarket = (m: MarketId) => {
    onMarketChange?.(m);
    const list = instrumentsFor(m);
    // Keep the selection count but move it onto the new market's leading instruments.
    onChange(list.slice(0, Math.max(min, Math.min(value.length, max))).map((i) => i.id));
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) toggle(results[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2 leading-4">{label}</span>
        {onMarketChange ? <MarketSelector value={market} onChange={switchMarket} size="sm" /> : <Badge tone="muted">{MARKETS[market].shortName}</Badge>}
      </div>
      <div className="relative mt-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          className="flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border border-border bg-raised px-2.5 py-1.5 text-left hover:border-border-strong focus:border-annot focus:outline-none"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {selected.length === 0 ? <span className="text-sm text-ink-4">Choose an instrument…</span> : null}
            {selected.map((i) =>
              max === 1 ? (
                <InstrumentRow key={i.id} instrument={i} />
              ) : (
                <span key={i.id} className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-panel px-1.5 py-0.5 text-xs">
                  <span className="num font-semibold text-ink">{i.symbol}</span>
                  <span className="text-ink-3">{i.currency}</span>
                  {value.length > min ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${i.symbol}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(i.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          toggle(i.id);
                        }
                      }}
                      className="ml-0.5 rounded p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
                    >
                      <X className="size-3" aria-hidden />
                    </span>
                  ) : null}
                </span>
              ),
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden />
        </button>

        {open ? (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 border-b border-hairline px-2.5">
              <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder={`Search ${MARKETS[market].shortName} by ticker or name`}
                aria-label="Search instruments"
                aria-controls={listId}
                aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
                className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-ink-4 focus:outline-none"
                autoComplete="off"
                inputMode="search"
              />
              {max > 1 ? (
                <span className="num shrink-0 text-2xs text-ink-3">
                  {value.length}/{max}
                </span>
              ) : null}
            </div>
            <ul id={listId} role="listbox" aria-multiselectable={max > 1} className="max-h-72 overflow-y-auto py-1">
              {results.length === 0 ? <li className="px-3 py-3 text-xs text-ink-3">No instruments match “{query}” on the {MARKETS[market].shortName}.</li> : null}
              {results.map((i, idx) => {
                const isSelected = value.includes(i.id);
                return (
                  <li
                    key={i.id}
                    id={`${listId}-${i.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => toggle(i.id)}
                    className={cn("flex cursor-pointer items-center gap-2 px-3 py-2", idx === active ? "bg-hover" : "", isSelected ? "text-ink" : "")}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[3px] border", isSelected ? "border-annot bg-annot text-ground" : "border-border")} aria-hidden>
                      {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <InstrumentRow instrument={i} compact />
                    <Badge tone="muted" className="ml-1 hidden sm:inline-flex">
                      {i.kind === "etf" ? "ETF" : i.kind === "crypto" ? "Crypto" : i.sector ?? "Equity"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
