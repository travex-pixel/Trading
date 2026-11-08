import type { Metadata } from "next";
import { Suspense } from "react";
import { Workbench } from "@/components/lab/workbench";
import { Skeleton } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Build" };

export default function BuildPage() {
  return (
    <div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Workbench />
      </Suspense>
    </div>
  );
}
