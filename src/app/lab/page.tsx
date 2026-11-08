import type { Metadata } from "next";
import Link from "next/link";
import { ArrowsLeftRight, Plus } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { StrategyLibrary } from "@/components/lab/library";

export const metadata: Metadata = { title: "Strategy Lab" };

export default function LabPage() {
  return (
    <div>
      <PageHeader
        title="Strategy Lab"
        description="Pick a strategy, configure it without writing code, and test it against history with every number backed by a benchmark."
        actions={
          <>
            <Button asChild>
              <Link href="/lab/compare">
                <ArrowsLeftRight className="size-4" aria-hidden /> Compare
              </Link>
            </Button>
            <Button variant="primary" asChild>
              <Link href="/lab/build">
                <Plus className="size-4" aria-hidden /> New experiment
              </Link>
            </Button>
          </>
        }
      />
      <StrategyLibrary />
    </div>
  );
}
