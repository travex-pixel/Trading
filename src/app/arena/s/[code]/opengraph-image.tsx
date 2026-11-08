import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, OgCard, brokenLinkCard, ogOptions } from "@/lib/og/card";
import { describeSharedCompetition } from "@/lib/og/describe";
import { decodeCompetitionSnapshot } from "@/lib/arena/snapshot";

export const alt = "A shared EdgeLab competition";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Preview card for a shared competition link: the name, the rules and who is in it. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const decoded = decodeCompetitionSnapshot(code);
  const options = await ogOptions();
  if (!decoded.ok) return new ImageResponse(brokenLinkCard("competition"), options);

  const d = describeSharedCompetition(decoded.snapshot);
  return new ImageResponse(
    (
      <OgCard
        eyebrow="BOT ARENA"
        title={d.title}
        titleSize={d.title.length > 28 ? 52 : 62}
        subtitle={d.subtitle}
        plate={d.plate}
      />
    ),
    options,
  );
}
