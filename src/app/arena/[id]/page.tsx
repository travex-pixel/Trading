import type { Metadata } from "next";
import { Suspense } from "react";
import { CompetitionView } from "@/components/arena/competition-view";
import { Skeleton } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Competition" };

/** `params` is runtime data under Cache Components, so it is read inside a Suspense boundary. */
export default function CompetitionPage({ params }: PageProps<"/arena/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/arena/[id]">["params"] }) {
  const { id } = await params;
  return <CompetitionView id={id} />;
}
