import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/panel";
import { SharedCompetition } from "@/components/arena/shared-competition";
import { decodeCompetitionSnapshot } from "@/lib/arena/snapshot";
import { describeSharedCompetition } from "@/lib/og/describe";

/** Title and description travel with the link, so a preview names the competition and its rules. */
export async function generateMetadata({ params }: PageProps<"/arena/s/[code]">): Promise<Metadata> {
  const { code } = await params;
  const decoded = decodeCompetitionSnapshot(code);
  if (!decoded.ok) return { title: "Shared competition", description: "This link cannot be opened." };
  const d = describeSharedCompetition(decoded.snapshot);
  return {
    title: d.title,
    description: d.subtitle,
    openGraph: { title: `${d.title} · EdgeLab`, description: d.subtitle, type: "article", siteName: "EdgeLab", locale: "en_AU", url: `/arena/s/${code}` },
    twitter: { card: "summary_large_image", title: `${d.title} · EdgeLab`, description: d.subtitle },
  };
}

export default function SharedCompetitionPage({ params }: PageProps<"/arena/s/[code]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/arena/s/[code]">["params"] }) {
  const { code } = await params;
  const decoded = decodeCompetitionSnapshot(code);
  if (!decoded.ok) {
    return (
      <div>
        <PageHeader title="Shared competition" />
        <ErrorState
          title="This link cannot be opened"
          body={decoded.error}
          action={
            <Button asChild>
              <Link href="/arena">Go to the Arena</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <SharedCompetition snapshot={decoded.snapshot} />;
}
