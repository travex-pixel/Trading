import type { Metadata } from "next";
import { Suspense } from "react";
import { ExperimentDetail } from "@/components/journal/experiment-detail";
import { Skeleton } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Experiment" };

/** `params` is runtime data under Cache Components, so it is read inside a Suspense boundary. */
export default function ExperimentPage({ params }: PageProps<"/journal/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/journal/[id]">["params"] }) {
  const { id } = await params;
  return <ExperimentDetail id={id} />;
}
