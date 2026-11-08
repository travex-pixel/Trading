import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/panel";
import { SharedCompetition } from "@/components/arena/shared-competition";
import { decodeCompetitionSnapshot } from "@/lib/arena/snapshot";

export const metadata: Metadata = { title: "Shared competition" };

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
