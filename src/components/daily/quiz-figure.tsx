"use client";

/**
 * The three figure types a quiz question can carry. Pure SVG, sized to the
 * container, no interaction: the question is the interaction.
 */

import { useEffect, useRef, useState } from "react";
import type { QuizFigure } from "@/lib/daily/quiz";
import { cn } from "@/lib/utils";

const CURVE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-4)"];

/**
 * Measures the box the figure is drawn into. In `fill` mode the box is the
 * absolutely positioned slot the parent reserves, so the chart takes whatever
 * height the screen has left rather than pushing content below the fold.
 */
function useBox(fill: boolean, initial = { width: 360, height: 200 }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number, h: number) =>
      setBox({
        width: Math.max(200, Math.floor(w)),
        height: fill ? Math.max(96, Math.floor(h)) : initial.height,
      });
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) read(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    read(r.width, r.height);
    return () => ro.disconnect();
  }, [fill, initial.height]);
  return { ref, ...box };
}

export function QuizFigureView({
  figure,
  revealed,
  answerIndex,
  className,
  fill = false,
}: {
  figure: QuizFigure;
  revealed: boolean;
  answerIndex: number;
  className?: string;
  fill?: boolean;
}) {
  const cls = cn(fill && "absolute inset-0", className);
  if (figure.type === "curves")
    return (
      <CurvesFigure
        figure={figure}
        revealed={revealed}
        answerIndex={answerIndex}
        className={cls}
        fill={fill}
      />
    );
  if (figure.type === "price")
    return <PriceFigure figure={figure} className={cls} fill={fill} />;
  return <StatsFigure figure={figure} className={cls} />;
}

function CurvesFigure({
  figure,
  revealed,
  answerIndex,
  className,
  fill,
}: {
  figure: Extract<QuizFigure, { type: "curves" }>;
  revealed: boolean;
  answerIndex: number;
  className?: string;
  fill: boolean;
}) {
  const { ref, width, height } = useBox(fill);
  const multi = figure.series.length > 1;
  // Leave room at the bottom for the legend that appears on reveal, so the chart never resizes under the player.
  // On very short screens there is no room for the legend under the curves. The review screen names them.
  const roomForLegend = height >= 120;
  const margin = {
    top: 14,
    right: 44,
    bottom: multi && roomForLegend ? 30 : 12,
    left: 8,
  };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  let min = Infinity;
  let max = -Infinity;
  for (const s of figure.series)
    for (const v of s.points) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  const pad = (max - min) * 0.06 || 1;
  min -= pad;
  max += pad;
  const x = (i: number, n: number) =>
    margin.left + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => margin.top + (1 - (v - min) / (max - min)) * plotH;
  const baseline = 100;
  return (
    <div ref={ref} className={cn("relative", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label={
          multi ? `${figure.series.length} equity curves` : "Equity curve"
        }
      >
        {/* Grid: three recessive hairlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={margin.left}
            x2={margin.left + plotW}
            y1={margin.top + plotH * f}
            y2={margin.top + plotH * f}
            stroke="var(--hairline)"
          />
        ))}
        {baseline > min && baseline < max ? (
          <line
            x1={margin.left}
            x2={margin.left + plotW}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--border)"
            strokeDasharray="2 3"
          />
        ) : null}
        {figure.series.map((s, si) => {
          const d = s.points
            .map(
              (v, i) =>
                `${i === 0 ? "M" : "L"}${x(i, s.points.length).toFixed(1)} ${y(v).toFixed(1)}`,
            )
            .join(" ");
          const isAnswer = revealed && multi && si === answerIndex;
          const dim = revealed && multi && si !== answerIndex;
          return (
            <g key={si}>
              <path
                d={d}
                fill="none"
                stroke={
                  multi
                    ? CURVE_COLORS[si % CURVE_COLORS.length]
                    : "var(--series-1)"
                }
                strokeWidth={isAnswer ? 2.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim ? 0.35 : 1}
                style={{ transition: "opacity 300ms var(--ease-out-quart)" }}
              />
              {multi ? (
                <text
                  x={margin.left + plotW + 6}
                  y={y(s.points[s.points.length - 1])}
                  dy="0.32em"
                  fontSize="11"
                  fontWeight={600}
                  fill={CURVE_COLORS[si % CURVE_COLORS.length]}
                  opacity={dim ? 0.45 : 1}
                  className="num"
                >
                  {s.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {!figure.hideScale ? (
          <>
            <text
              x={margin.left + plotW + 6}
              y={y(baseline)}
              dy="0.32em"
              fontSize="10"
              fill="var(--ink-3)"
              className="num"
            >
              start
            </text>
          </>
        ) : null}
      </svg>
      {figure.hideScale && roomForLegend ? (
        <div className="pointer-events-none absolute right-2 top-0 font-mono text-[10px] uppercase tracking-wider text-ink-4">
          scale hidden
        </div>
      ) : null}
      {multi && roomForLegend ? (
        <ul
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-2 transition-opacity duration-300",
            revealed ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={!revealed}
        >
          {figure.series.map((s, si) => (
            <li key={si} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3.5 rounded"
                style={{ background: CURVE_COLORS[si % CURVE_COLORS.length] }}
                aria-hidden
              />
              <span className="num font-semibold text-ink">{s.label}</span>
              <span className="truncate">{s.revealName}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PriceFigure({
  figure,
  className,
  fill,
}: {
  figure: Extract<QuizFigure, { type: "price" }>;
  className?: string;
  fill: boolean;
}) {
  const { ref, width, height } = useBox(fill);
  const margin = { top: 14, right: 64, bottom: 18, left: 8 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const closes = figure.closes;
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  const pad = (max - min) * 0.1 || 1;
  min -= pad;
  max += pad;
  const x = (i: number) =>
    margin.left + (i / Math.max(1, closes.length - 1)) * plotW;
  const y = (v: number) => margin.top + (1 - (v - min) / (max - min)) * plotH;
  const d = closes
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`,
    )
    .join(" ");
  const ex = x(figure.entryIndex);
  const ey = y(figure.entryPrice);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label={`${figure.asset} price leading up to the entry`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={margin.left}
            x2={margin.left + plotW}
            y1={margin.top + plotH * f}
            y2={margin.top + plotH * f}
            stroke="var(--hairline)"
          />
        ))}
        <path
          d={d}
          fill="none"
          stroke="var(--ink-2)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Entry: dimension tick and label, the drawing-set motif */}
        <line
          x1={ex}
          x2={ex}
          y1={margin.top}
          y2={margin.top + plotH}
          stroke="var(--annot)"
          strokeDasharray="2 3"
        />
        <circle
          cx={ex}
          cy={ey}
          r={5}
          fill="var(--up)"
          stroke="var(--panel)"
          strokeWidth={2}
        />
        <line
          x1={ex + 8}
          x2={margin.left + plotW + 6}
          y1={ey}
          y2={ey}
          stroke="var(--annot)"
          opacity={0.7}
        />
        <text
          x={margin.left + plotW + 8}
          y={ey}
          dy="0.32em"
          fontSize="10"
          fill="var(--annot)"
          className="num"
        >
          buy{" "}
          {figure.entryPrice.toLocaleString("en-US", {
            maximumFractionDigits: 0,
          })}
        </text>
        <text
          x={ex - 4}
          y={margin.top + 9}
          fontSize="10"
          textAnchor="end"
          fill="var(--ink-3)"
          className="num"
        >
          what the strategy saw →
        </text>
      </svg>
      <div className="pointer-events-none absolute right-2 bottom-0 font-mono text-[10px] uppercase tracking-wider text-ink-4">
        what happened next is hidden
      </div>
    </div>
  );
}

function StatsFigure({
  figure,
  className,
}: {
  figure: Extract<QuizFigure, { type: "stats" }>;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col justify-center overflow-x-auto", className)}
    >
      <table className="table">
        <thead>
          <tr>
            <th scope="col" />
            {figure.rows[0]?.cells.map((c) => (
              <th key={c.key} scope="col" className="num">
                {c.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {figure.rows.map((r, i) => (
            <tr key={r.label}>
              <th scope="row" className="font-semibold">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{
                      background: CURVE_COLORS[i % CURVE_COLORS.length],
                    }}
                    aria-hidden
                  />
                  <span className="num text-ink">{r.label}</span>
                </span>
              </th>
              {r.cells.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "num",
                    c.key === "Return"
                      ? c.value.startsWith("-")
                        ? "text-down"
                        : "text-up"
                      : c.key === "Max drawdown"
                        ? "text-down"
                        : "text-ink-2",
                  )}
                >
                  {c.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
