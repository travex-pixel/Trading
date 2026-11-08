"use client";

/**
 * Candlestick chart with indicator overlays, an oscillator pane and trade
 * markers, built on lightweight-charts v5. Supports progressive reveal for
 * Trade Replay: only candles[0..visibleCount) are rendered.
 */

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/quant/types";
import type { IndicatorDisplay } from "@/lib/strategies/runtime";

export interface PriceMarker {
  time: number;
  kind: "entry" | "exit";
  text?: string;
}

export interface PriceLineSpec {
  price: number;
  color: string;
  title: string;
  style?: "solid" | "dashed";
}

export interface PriceChartProps {
  candles: Candle[];
  /** Indicator values aligned to candles. */
  indicators?: Record<string, (number | null)[]>;
  display?: IndicatorDisplay[];
  markers?: PriceMarker[];
  priceLines?: PriceLineSpec[];
  /** Render only the first N candles (replay). Defaults to all. */
  visibleCount?: number;
  /** Keep the latest visible bar in view as it advances. */
  followLatest?: boolean;
  height?: number;
  /** Number of bars to show in the viewport in replay mode. */
  windowBars?: number;
  className?: string;
}

const INDICATOR_COLORS = ["var(--series-1)", "var(--series-4)", "var(--series-5)", "var(--series-3)"];

function resolveCssVar(name: string, el: HTMLElement): string {
  if (!name.startsWith("var(")) return name;
  const v = name.slice(4, -1).trim();
  return getComputedStyle(el).getPropertyValue(v).trim() || "#888";
}

function ts(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export function PriceChart({
  candles,
  indicators = {},
  display = [],
  markers = [],
  priceLines = [],
  visibleCount,
  followLatest = false,
  height = 320,
  windowBars = 120,
  className,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const histRefs = useRef<Map<string, ISeriesApi<"Histogram">>>(new Map());
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const renderedCount = useRef(0);
  const hasOscillator = display.some((d) => d.pane === "oscillator");

  // Create chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const c = (v: string) => resolveCssVar(v, el);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: c("var(--ink-3)"),
        fontFamily: getComputedStyle(el).getPropertyValue("--font-sometype").trim() || "ui-monospace, monospace",
        fontSize: 10,
        attributionLogo: false,
        panes: { separatorColor: c("var(--hairline)"), separatorHoverColor: c("var(--border)"), enableResize: false },
      },
      grid: { vertLines: { color: c("var(--hairline)") }, horzLines: { color: c("var(--hairline)") } },
      rightPriceScale: { borderColor: c("var(--border)"), scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: c("var(--border)"), timeVisible: true, secondsVisible: false, rightOffset: 2, barSpacing: 6 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c("var(--ink-3)"), labelBackgroundColor: c("var(--raised)"), width: 1, style: LineStyle.Solid },
        horzLine: { color: c("var(--ink-3)"), labelBackgroundColor: c("var(--raised)"), width: 1, style: LineStyle.Solid },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: { time: true, price: false } },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: c("var(--up)"),
      downColor: c("var(--down)"),
      borderVisible: false,
      wickUpColor: c("var(--up)"),
      wickDownColor: c("var(--down)"),
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    candleRef.current = candleSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);
    const lines = lineRefs.current;
    const hists = histRefs.current;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      lines.clear();
      hists.clear();
      markersRef.current = null;
      renderedCount.current = 0;
    };
  }, []);

  // Indicator series: (re)create when the display spec changes.
  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;
    for (const s of lineRefs.current.values()) chart.removeSeries(s);
    for (const s of histRefs.current.values()) chart.removeSeries(s);
    lineRefs.current.clear();
    histRefs.current.clear();
    let colorIdx = 0;
    for (const d of display) {
      const paneIndex = d.pane === "oscillator" ? 1 : 0;
      const color = resolveCssVar(INDICATOR_COLORS[colorIdx++ % INDICATOR_COLORS.length], el);
      if (d.key.endsWith("macd_hist")) {
        histRefs.current.set(d.key, chart.addSeries(HistogramSeries, { color, priceLineVisible: false, lastValueVisible: false, title: d.label }, paneIndex));
        continue;
      }
      const line = chart.addSeries(
        LineSeries,
        { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: d.label },
        paneIndex,
      );
      if (d.levels && d.pane === "oscillator") {
        for (const level of d.levels) {
          line.createPriceLine({ price: level, color: resolveCssVar("var(--border-strong)", el), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "" });
        }
      }
      lineRefs.current.set(d.key, line);
    }
    if (hasOscillator) {
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(Math.round(height * 0.28));
    }
    renderedCount.current = 0; // force full data reload
  }, [display, hasOscillator, height]);

  // Data: full set or progressive reveal.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    if (!chart || !candleSeries) return;
    const count = Math.min(candles.length, visibleCount ?? candles.length);
    const toCandle = (k: Candle) => ({ time: ts(k.time), open: k.open, high: k.high, low: k.low, close: k.close });
    const toLine = (key: string, i: number) => {
      const v = indicators[key]?.[i];
      return v === null || v === undefined ? { time: ts(candles[i].time) } : { time: ts(candles[i].time), value: v };
    };

    // Price precision follows the asset's price level so axis labels stay compact.
    if (renderedCount.current === 0 && count > 0) {
      const level = candles[Math.min(count, candles.length) - 1].close;
      const precision = level >= 1000 ? 0 : level >= 10 ? 2 : 4;
      candleSeries.applyOptions({ priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) } });
    }

    const prev = renderedCount.current;
    if (count >= prev && prev > 0 && count - prev <= 50) {
      for (let i = prev; i < count; i++) {
        candleSeries.update(toCandle(candles[i]));
        for (const [key, s] of lineRefs.current) s.update(toLine(key, i));
        for (const [key, s] of histRefs.current) s.update(toLine(key, i));
      }
    } else {
      const slice = candles.slice(0, count);
      candleSeries.setData(slice.map(toCandle));
      for (const [key, s] of lineRefs.current) s.setData(slice.map((_, i) => toLine(key, i)));
      for (const [key, s] of histRefs.current) s.setData(slice.map((_, i) => toLine(key, i)));
      if (visibleCount === undefined) chart.timeScale().fitContent();
    }
    renderedCount.current = count;

    if (visibleCount !== undefined && followLatest && count > 0) {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - windowBars), to: count + 3 });
    }
  }, [candles, indicators, visibleCount, followLatest, windowBars]);

  // Markers.
  useEffect(() => {
    const el = containerRef.current;
    const plugin = markersRef.current;
    if (!el || !plugin) return;
    const limit = visibleCount === undefined ? Infinity : candles[Math.min(candles.length, visibleCount) - 1]?.time ?? -Infinity;
    const up = resolveCssVar("var(--up)", el);
    const down = resolveCssVar("var(--down)", el);
    const list: SeriesMarker<Time>[] = markers
      .filter((m) => m.time <= limit)
      .map((m) => ({
        time: ts(m.time),
        position: m.kind === "entry" ? "belowBar" : "aboveBar",
        shape: m.kind === "entry" ? "arrowUp" : "arrowDown",
        color: m.kind === "entry" ? up : down,
        text: m.text,
        size: 1,
      }));
    plugin.setMarkers(list);
  }, [markers, visibleCount, candles]);

  // Price lines (stop / take profit / entry).
  useEffect(() => {
    const el = containerRef.current;
    const s = candleRef.current;
    if (!el || !s) return;
    for (const pl of priceLineRefs.current) s.removePriceLine(pl);
    priceLineRefs.current = priceLines.map((p) =>
      s.createPriceLine({
        price: p.price,
        color: resolveCssVar(p.color, el),
        lineWidth: 1,
        lineStyle: p.style === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: p.title,
      }),
    );
  }, [priceLines]);

  return <div ref={containerRef} className={className} style={{ height, width: "100%" }} role="img" aria-label="Price chart" />;
}
