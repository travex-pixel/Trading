import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/panel";
import { SimulatedBadge } from "@/components/ui/badge";
import { PaperDesk } from "@/components/paper/paper-desk";

export const metadata: Metadata = { title: "Paper Trading" };

export default function PaperPage() {
  return (
    <div>
      <PageHeader
        title="Paper Trading"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <SimulatedBadge />
            <span>Simulated portfolios that follow a strategy forward in time with virtual capital. No orders are placed anywhere.</span>
          </span>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PaperDesk />
      </Suspense>
    </div>
  );
}
