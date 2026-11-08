import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, OgCard, ogOptions } from "@/lib/og/card";

export const alt = "EdgeLab. Find an edge. Prove it. Beat the market.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Site-wide link preview. Generated once at build time and served as a static PNG. */
export default async function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="RESEARCH · SIMULATION ONLY"
        title="Find an edge. Prove it. Beat the market."
        subtitle="Test a trading idea on ASX, US and crypto history without writing code. Every result carries its benchmark, its period and its caveats."
        plate={[
          { label: "Markets", value: "ASX · US · Crypto" },
          { label: "Fills", value: "next bar's open" },
          { label: "Checks", value: "walk-forward · sensitivity" },
          { label: "Data", value: "labelled demo or real" },
        ]}
      />
    ),
    await ogOptions(),
  );
}
