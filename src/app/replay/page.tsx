import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/empty";
import { Replay } from "@/components/replay/replay";

export const metadata: Metadata = { title: "Trade Replay" };

export default function ReplayPage() {
  return (
    <div>
      <PageHeader title="Trade Replay" description="Watch a strategy trade bar by bar. The strategy only ever saw the bars to the left of the cursor, and every fill happens at the next bar's open." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Replay />
      </Suspense>
    </div>
  );
}
