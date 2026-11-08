import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/panel";
import { SharedExperiment } from "@/components/lab/shared-experiment";
import { describeSharedExperiment } from "@/lib/og/describe";
import { decodeSnapshot } from "@/lib/store/snapshot";

/** Title and description travel with the link, so a WhatsApp or Messenger preview names the strategy and instrument. */
export async function generateMetadata({ params }: PageProps<"/s/[code]">): Promise<Metadata> {
  const { code } = await params;
  const decoded = decodeSnapshot(code);
  if (!decoded.ok) return { title: "Shared experiment", description: "This link cannot be opened." };
  const d = describeSharedExperiment(decoded.snapshot);
  return {
    title: d.title,
    description: d.subtitle,
    openGraph: { title: `${d.title} · EdgeLab`, description: d.subtitle, type: "article", siteName: "EdgeLab", locale: "en_AU", url: `/s/${code}` },
    twitter: { card: "summary_large_image", title: `${d.title} · EdgeLab`, description: d.subtitle },
  };
}

/** `params` is runtime data under Cache Components, so it is read inside a Suspense boundary. */
export default function SharePage({ params }: PageProps<"/s/[code]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/s/[code]">["params"] }) {
  const { code } = await params;
  const decoded = decodeSnapshot(code);
  if (!decoded.ok) {
    return (
      <div>
        <PageHeader title="Shared experiment" />
        <ErrorState
          title="This link cannot be opened"
          body={decoded.error}
          action={
            <Button asChild>
              <Link href="/lab">Go to the Lab</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title={decoded.snapshot.title ?? decoded.snapshot.config.name}
        description="A shared experiment. Your browser re-ran it on the same dataset version, so these numbers were reproduced here, not copied from the sender."
        actions={
          <Button variant="primary" asChild>
            <Link href={`/lab/build?s=${code}`}>Open in the Lab</Link>
          </Button>
        }
      />
      <SharedExperiment snapshot={decoded.snapshot} />
    </div>
  );
}
