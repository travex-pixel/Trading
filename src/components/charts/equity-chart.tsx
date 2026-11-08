"use client";

/**
 * Equity curve chart in SVG with the product's annotations: a vertical
 * "wall" between in-sample and out-of-sample periods and a dimension line
 * bracketing the maximum drawdown. Up to five series plus muted benchmarks.
 * Hover shows a crosshair and every series value at that time.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { downsample } from "@/lib/utils";

export interface EquitySeries {
  id: string;
  name: string;
  /** Points sorted by time. */
  points: ReadonlyArray<{ time: number; equity: number }>;
  color: string;
  /** Benchmarks render thinner and muted. */
  muted?: boolean;
}

export interface DrawdownAnnotation {
  peakTime: number;
  troughTime: number;
  peakEquity: number;
  troughEquity: number;
  label: string;
}

export interface WallAnnotation {
  time: number;
  label: string;
}

export function EquityChart({
  series,
  height = 260,
  mode = "value",
  drawdown,
  walls = [],
  shade,
  className,
  compact = false,
}: {
  series: EquitySeries[];
  height?: number;
  /** "value" plots equity; "percent" rebases each series to 0% at its first point. */
  mode?: "value" | "percent";
  drawdown?: DrawdownAnnotation | null;
  walls?: WallAnnotation[];
  /** Shaded time ranges (e.g. test windows). */
  shade?: Array<{ start: number; end: number; label?: string }>;
  className?: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(200, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    setWidth(Math.max(200, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  const margin = compact ? { top: 8, right: 8, bottom: 20, left: 8 } : { top: 12, right: 56, bottom: 24, left: 8 };
  const plotW = Math.max(10, width - margin.left - margin.right);
  const plotH = Math.max(10, height - margin.top - margin.bottom);

  const prepared = useMemo(() => {
    const MAX_POINTS = 1200;
    return series.map((s) => {
      const pts = downsample(s.points, MAX_POINTS);
      const base = pts.length ? pts[0].equity : 1;
      return {
        ...s,
        pts: pts.map((p) => ({ time: p.time, value: mode === "percent" ? (base > 0 ? (p.equity / base - 1) * 100 : 0) : p.equity })),
      };
    });
  }, [series, mode]);

  const domain = useMemo(() => {
    let tMin = Infinity;
    let tMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const s of prepared) {
      for (const p of s.pts) {
        if (p.time < tMin) tMin = p.time;
        if (p.time > tMax) tMax = p.time;
        if (p.value < vMin) vMin = p.value;
        if (p.value > vMax) vMax = p.value;
      }
    }
    if (!Number.isFinite(tMin)) return null;
    if (vMin === vMax) {
      vMin -= 1;
      vMax += 1;
    }
    const padV = (vMax - vMin) * 0.06;
    return { tMin, tMax: tMax === tMin ? tMin + 1 : tMax, vMin: vMin - padV, vMax: vMax + padV };
  }, [prepared]);

  const x = useCallback((t: number) => (domain ? margin.left + ((t - domain.tMin) / (domain.tMax - domain.tMin)) * plotW : 0), [domain, margin.left, plotW]);
  const y = useCallback((v: number) => (domain ? margin.top + (1 - (v - domain.vMin) / (domain.vMax - domain.vMin)) * plotH : 0), [domain, margin.top, plotH]);

  const ticks = useMemo(() => {
    if (!domain) return [];
    const n = compact ? 3 : 5;
    const raw = (domain.vMax - domain.vMin) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const start = Math.ceil(domain.vMin / step) * step;
    const out: number[] = [];
    for (let v = start; v <= domain.vMax; v += step) out.push(v);
    return out;
  }, [domain, compact]);

  const timeTicks = useMemo(() => {
    if (!domain) return [];
    const n = compact ? 2 : Math.max(2, Math.min(6, Math.floor(plotW / 110)));
    const out: number[] = [];
    for (let i = 0; i <= n; i++) out.push(domain.tMin + ((domain.tMax - domain.tMin) * i) / n);
    return out;
  }, [domain, plotW, compact]);

  const onMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (!domain) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;
    const px = clientX - rect.left;
    const t = domain.tMin + ((px - margin.left) / plotW) * (domain.tMax - domain.tMin);
    setHover(Math.min(domain.tMax, Math.max(domain.tMin, t)));
  };

  const hoverValues = useMemo(() => {
    if (hover === null) return null;
    return prepared.map((s) => {
      let lo = 0;
      let hi = s.pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.pts[mid].time < hover) lo = mid + 1;
        else hi = mid;
      }
      const p = s.pts[lo] ?? null;
      return { id: s.id, name: s.name, color: s.color, muted: s.muted, point: p };
    });
  }, [hover, prepared]);

  const fmtV = (v: number) => (mode === "percent" ? fmtPct(v, { sign: true, digits: Math.abs(v) >= 100 ? 0 : 1 }) : fmtMoney(v, { compact: true }));

  if (!domain) {
    return (
      <div ref={ref} className={className} style={{ height }}>
        <div className="flex h-full items-center justify-center text-xs text-ink-3">No data to plot.</div>
      </div>
    );
  }

  const hoverX = hover !== null ? x(hover) : null;
  const tooltipLeft = hoverX !== null ? (hoverX > width * 0.6 ? hoverX - 180 : hoverX + 12) : 0;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block touch-pan-y select-none"
        role="img"
        aria-label={`Equity chart with ${series.length} series`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={margin.left} y={margin.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Shaded ranges */}
        {shade?.map((s, i) => {
          const x0 = x(Math.max(s.start, domain.tMin));
          const x1 = x(Math.min(s.end, domain.tMax));
          if (x1 <= x0) return null;
          return <rect key={i} x={x0} y={margin.top} width={x1 - x0} height={plotH} fill="var(--annot)" opacity={0.07} />;
        })}

        {/* Grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margin.left} x2={margin.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth="1" />
            {!compact ? (
              <text x={margin.left + plotW + 6} y={y(t)} dy="0.32em" fontSize="10" fill="var(--ink-3)" className="num">
                {fmtV(t)}
              </text>
            ) : null}
          </g>
        ))}
        {/* Zero / base line for percent mode */}
        {mode === "percent" && domain.vMin < 0 && domain.vMax > 0 ? (
          <line x1={margin.left} x2={margin.left + plotW} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth="1" />
        ) : null}
        {/* Time axis */}
        <line x1={margin.left} x2={margin.left + plotW} y1={margin.top + plotH} y2={margin.top + plotH} stroke="var(--border)" strokeWidth="1" />
        {timeTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={margin.top + plotH + 14}
            fontSize="10"
            fill="var(--ink-3)"
            textAnchor={i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle"}
            className="num"
          >
            {fmtDate(t)}
          </text>
        ))}

        {/* Series (muted first so highlights draw on top) */}
        <g clipPath={`url(#${clipId})`}>
          {[...prepared]
            .sort((a, b) => Number(Boolean(b.muted)) - Number(Boolean(a.muted)))
            .map((s) => {
              const d = s.pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.time).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
              return (
                <path
                  key={s.id}
                  d={d}
                  fill="none"
                  stroke={s.muted ? "var(--series-muted)" : s.color}
                  strokeWidth={s.muted ? 1.25 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={hoverValues && !s.muted ? 1 : s.muted ? 0.9 : 1}
                />
              );
            })}
        </g>

        {/* Walls */}
        {walls.map((w, i) => {
          if (w.time < domain.tMin || w.time > domain.tMax) return null;
          const wx = x(w.time);
          return (
            <g key={i}>
              <line x1={wx} x2={wx} y1={margin.top} y2={margin.top + plotH} stroke="var(--annot)" strokeWidth="1" strokeDasharray="2 3" />
              {!compact ? (
                <text x={wx + 4} y={margin.top + 10} fontSize="10" fill="var(--annot)" className="num">
                  {w.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Drawdown dimension line: bracket from peak to trough with ticks and label */}
        {drawdown && !compact ? <DrawdownDimension dd={drawdown} x={x} y={y} mode={mode} base={prepared[0]?.points[0]?.equity ?? 1} plotRight={margin.left + plotW} /> : null}

        {/* Hover crosshair */}
        {hoverX !== null ? (
          <g>
            <line x1={hoverX} x2={hoverX} y1={margin.top} y2={margin.top + plotH} stroke="var(--ink-3)" strokeWidth="1" />
            {hoverValues?.map((h) =>
              h.point ? (
                <circle key={h.id} cx={x(h.point.time)} cy={y(h.point.value)} r={3.5} fill={h.muted ? "var(--series-muted)" : h.color} stroke="var(--panel)" strokeWidth="2" />
              ) : null,
            )}
          </g>
        ) : null}
      </svg>

      {hoverValues && hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 w-[168px] rounded-[var(--radius-md)] border border-border bg-raised/95 p-2 text-2xs shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          style={{ left: tooltipLeft }}
        >
          <div className="num mb-1 text-ink-3">{fmtDate(hover)}</div>
          <ul className="space-y-0.5">
            {hoverValues.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: h.muted ? "var(--series-muted)" : h.color }} aria-hidden />
                  <span className="truncate">{h.name}</span>
                </span>
                <span className="num text-ink">{h.point ? fmtV(h.point.value) : "–"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DrawdownDimension({
  dd,
  x,
  y,
  mode,
  base,
  plotRight,
}: {
  dd: DrawdownAnnotation;
  x: (t: number) => number;
  y: (v: number) => number;
  mode: "value" | "percent";
  base: number;
  plotRight: number;
}) {
  const toV = (e: number) => (mode === "percent" ? (base > 0 ? (e / base - 1) * 100 : 0) : e);
  const x0 = x(dd.peakTime);
  const x1 = x(dd.troughTime);
  const yTop = y(toV(dd.peakEquity));
  const yBot = y(toV(dd.troughEquity));
  // Place the dimension line to the right of the span unless it would run into the axis gutter; then to the left of the peak.
  const labelWidth = dd.label.length * 6.2 + 14;
  const rightSide = Math.max(x0, x1) + 10 + labelWidth < plotRight;
  const lx = rightSide ? Math.max(x0, x1) + 10 : Math.min(x0, x1) - 10;
  const ext = rightSide ? lx + 4 : lx - 4;
  return (
    <g aria-label={`Maximum drawdown ${dd.label}`}>
      {/* Extension lines from peak and trough */}
      <line x1={x0} x2={ext} y1={yTop} y2={yTop} stroke="var(--down)" strokeWidth="1" opacity="0.7" />
      <line x1={x1} x2={ext} y1={yBot} y2={yBot} stroke="var(--down)" strokeWidth="1" opacity="0.7" />
      {/* Dimension line with ticks */}
      <line x1={lx} x2={lx} y1={yTop} y2={yBot} stroke="var(--down)" strokeWidth="1" />
      <line x1={lx - 3} x2={lx + 3} y1={yTop} y2={yTop} stroke="var(--down)" strokeWidth="1" />
      <line x1={lx - 3} x2={lx + 3} y1={yBot} y2={yBot} stroke="var(--down)" strokeWidth="1" />
      <text x={rightSide ? lx + 6 : lx - 6} y={(yTop + yBot) / 2} dy="0.32em" fontSize="10" fill="var(--down)" textAnchor={rightSide ? "start" : "end"} className="num">
        {dd.label}
      </text>
    </g>
  );
}
