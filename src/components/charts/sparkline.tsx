import { downsample } from "@/lib/utils";

/** A tiny inline line, de-emphasised by default. Pure SVG, no interaction. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = "auto",
  className,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  tone?: "auto" | "muted" | "up" | "down" | "annot";
  className?: string;
}) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const pts = downsample(values, 60);
  let min = Infinity;
  let max = -Infinity;
  for (const v of pts) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const pad = 2;
  const d = pts
    .map((v, i) => {
      const x = pad + (i / (pts.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const resolved = tone === "auto" ? (pts[pts.length - 1] >= pts[0] ? "up" : "down") : tone;
  const stroke = { muted: "var(--ink-3)", up: "var(--up)", down: "var(--down)", annot: "var(--annot)" }[resolved];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
