import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";

/**
 * Link-preview cards (Open Graph images) for WhatsApp, Messenger, iMessage,
 * Slack and X. Rendered server-side at exactly 1200 × 630 from vector text
 * and SVG, so the result is crisp at any thumbnail size and stays well under
 * the 300 KB ceiling WhatsApp applies before it falls back to a tiny icon.
 *
 * The renderer accepts a subset of CSS: every element with more than one
 * child must be `display: flex`, and fonts are supplied as file data.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const FONT_DIR = join(process.cwd(), "src/lib/og/fonts");

async function loadFonts() {
  const [grotesk400, grotesk600, mono400] = await Promise.all([
    readFile(join(FONT_DIR, "SchibstedGrotesk-400.woff")),
    readFile(join(FONT_DIR, "SchibstedGrotesk-600.woff")),
    readFile(join(FONT_DIR, "SometypeMono-400.woff")),
  ]);
  return [
    {
      name: "Schibsted Grotesk",
      data: grotesk400,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Schibsted Grotesk",
      data: grotesk600,
      weight: 600 as const,
      style: "normal" as const,
    },
    {
      name: "Sometype Mono",
      data: mono400,
      weight: 400 as const,
      style: "normal" as const,
    },
  ];
}

/** Fonts do not depend on the request, so they are read once per server instance. */
const fontsPromise = loadFonts();

export async function ogOptions() {
  return { ...OG_SIZE, fonts: await fontsPromise };
}

// Design tokens, duplicated from globals.css because the renderer cannot read CSS variables.
const C = {
  ground: "#0c0d10",
  panel: "#121317",
  hairline: "#1f2026",
  border: "#2a2b32",
  ink: "#ece9e2",
  ink2: "#a9a69f",
  ink3: "#74726c",
  ink4: "#4e4d49",
  annot: "#7aa2d6",
  warn: "#e0a84a",
  down: "#f0716a",
  muted: "#6b6a66",
};

const MONO = "Sometype Mono";
const GROTESK = "Schibsted Grotesk";

export type PlateCell = {
  label: string;
  value: string;
  tone?: "warn" | "default";
};

export function OgCard({
  eyebrow,
  eyebrowTone = "default",
  title,
  titleSize = 64,
  subtitle,
  plate,
  chart = true,
}: {
  eyebrow: string;
  eyebrowTone?: "warn" | "default";
  title: string;
  titleSize?: number;
  subtitle: string;
  plate: PlateCell[];
  chart?: boolean;
}) {
  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "52px 56px 44px",
        background: C.ground,
        color: C.ink,
        fontFamily: GROTESK,
      }}
    >
      <Header eyebrow={eyebrow} eyebrowTone={eyebrowTone} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 48,
          flex: 1,
          marginTop: 28,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: C.ink,
              textWrap: "balance",
              display: "flex",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 25,
              lineHeight: 1.35,
              color: C.ink2,
              maxWidth: 600,
              display: "flex",
            }}
          >
            {subtitle}
          </div>
        </div>
        {chart ? <EquitySketch /> : null}
      </div>

      <Plate cells={plate} />
    </div>
  );
}

function Header({
  eyebrow,
  eyebrowTone,
}: {
  eyebrow: string;
  eyebrowTone: "warn" | "default";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.ink}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
        <div
          style={{
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            display: "flex",
          }}
        >
          EdgeLab
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          border: `1px solid ${eyebrowTone === "warn" ? "rgba(224,168,74,0.45)" : C.border}`,
          borderRadius: 4,
          fontFamily: MONO,
          fontSize: 16,
          letterSpacing: "0.06em",
          color: eyebrowTone === "warn" ? C.warn : C.ink3,
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: 7,
            background: eyebrowTone === "warn" ? C.warn : C.ink3,
            display: "flex",
          }}
        />
        {eyebrow}
      </div>
    </div>
  );
}

function Plate({ cells }: { cells: PlateCell[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 30,
        rowGap: 14,
        paddingTop: 20,
        borderTop: `1px solid ${C.hairline}`,
        fontFamily: MONO,
        fontSize: 17,
        lineHeight: 1,
      }}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          style={{ display: "flex", alignItems: "baseline", gap: 10 }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: "0.1em",
              color: C.ink4,
              display: "flex",
            }}
          >
            {c.label.toUpperCase()}
          </div>
          <div
            style={{
              color: c.tone === "warn" ? C.warn : C.ink2,
              display: "flex",
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A deterministic equity sketch: strategy line in annotation blue, benchmark in grey,
 * and the house dimension line marking the largest fall from a previous high.
 * Pure decoration, with no figures, so it can never be mistaken for a result.
 */
function EquitySketch() {
  const W = 440;
  const H = 250;
  const pad = 8;
  const n = 72;
  // Tiny linear congruential generator so the sketch is identical on every render.
  let s = 20261108;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
  const strat: number[] = [100];
  const bench: number[] = [100];
  for (let i = 1; i < n; i++) {
    const drift = i < 26 ? 0.9 : i < 44 ? -0.95 : 0.8;
    strat.push(strat[i - 1] + drift + rnd() * 2.6);
    bench.push(bench[i - 1] + 0.35 + rnd() * 2.2);
  }
  const all = [...strat, ...bench];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2 - 70);
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
  const path = (arr: number[]) =>
    arr
      .map(
        (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join(" ");

  // Peak before the fall and the trough after it.
  let peakI = 0;
  for (let i = 0; i < 26; i++) if (strat[i] > strat[peakI]) peakI = i;
  let troughI = peakI;
  for (let i = peakI; i < 50; i++) if (strat[i] < strat[troughI]) troughI = i;
  const dimX = x(troughI) + 26;

  const midY = (y(strat[peakI]) + y(strat[troughI])) / 2;

  return (
    <div style={{ position: "relative", width: W, height: H, display: "flex" }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "flex" }}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W - 60}
            y1={pad + f * (H - pad * 2)}
            y2={pad + f * (H - pad * 2)}
            stroke={C.hairline}
            strokeWidth="1"
          />
        ))}
        <path
          d={path(bench)}
          fill="none"
          stroke={C.muted}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d={path(strat)}
          fill="none"
          stroke={C.annot}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line
          x1={x(peakI)}
          x2={dimX + 4}
          y1={y(strat[peakI])}
          y2={y(strat[peakI])}
          stroke={C.down}
          strokeWidth="1"
          opacity="0.8"
        />
        <line
          x1={x(troughI)}
          x2={dimX + 4}
          y1={y(strat[troughI])}
          y2={y(strat[troughI])}
          stroke={C.down}
          strokeWidth="1"
          opacity="0.8"
        />
        <line
          x1={dimX}
          x2={dimX}
          y1={y(strat[peakI])}
          y2={y(strat[troughI])}
          stroke={C.down}
          strokeWidth="1.2"
        />
        <line
          x1={dimX - 4}
          x2={dimX + 4}
          y1={y(strat[peakI])}
          y2={y(strat[peakI])}
          stroke={C.down}
          strokeWidth="1.2"
        />
        <line
          x1={dimX - 4}
          x2={dimX + 4}
          y1={y(strat[troughI])}
          y2={y(strat[troughI])}
          stroke={C.down}
          strokeWidth="1.2"
        />
      </svg>
      {/* The renderer does not support SVG text, so the label is an overlaid element. */}
      <div
        style={{
          position: "absolute",
          left: dimX + 10,
          top: midY - 8,
          fontFamily: MONO,
          fontSize: 13,
          color: C.down,
          display: "flex",
        }}
      >
        max DD
      </div>
    </div>
  );
}

/** Shared fallback when a share code does not decode. Still branded, still honest. */
export function brokenLinkCard(
  kind: "experiment" | "competition",
): ReactElement {
  return (
    <OgCard
      eyebrow={kind === "experiment" ? "SHARED EXPERIMENT" : "BOT ARENA"}
      title="This link cannot be opened"
      titleSize={56}
      subtitle="The code in the address is incomplete or has been altered. Ask the sender to share it again from EdgeLab."
      plate={[
        { label: "Product", value: "EdgeLab" },
        { label: "Scope", value: "research · simulation only" },
      ]}
      chart={false}
    />
  );
}
