import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/panel";
import { ComparePanel } from "@/components/lab/compare-panel";

export const metadata: Metadata = { title: "Compare strategies" };

export default function ComparePage() {
  return (
    <div>
      <PageHeader title="Compare strategies" description="Side by side under the same period, capital and costs. The highest return is not automatically the winner." />
      <ComparePanel />
    </div>
  );
}
