import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, OgCard, brokenLinkCard, ogOptions } from "@/lib/og/card";
import { describeSharedExperiment } from "@/lib/og/describe";
import { decodeSnapshot } from "@/lib/store/snapshot";

export const alt = "A shared EdgeLab experiment";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Preview card for a shared experiment link. Shows the configuration, never results, because the recipient's browser recomputes those. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const decoded = decodeSnapshot(code);
  const options = await ogOptions();
  if (!decoded.ok) return new ImageResponse(brokenLinkCard("experiment"), options);

  const d = describeSharedExperiment(decoded.snapshot);
  return new ImageResponse(
    (
      <OgCard
        eyebrow="SHARED EXPERIMENT"
        title={d.title}
        titleSize={d.title.length > 28 ? 52 : 62}
        subtitle={d.subtitle}
        plate={d.plate}
      />
    ),
    options,
  );
}
