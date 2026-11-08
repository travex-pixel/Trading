import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { JournalList } from "@/components/journal/journal-list";

export const metadata: Metadata = { title: "Research Journal" };

export default function JournalPage() {
  return (
    <div>
      <PageHeader
        title="Research Journal"
        description="Every experiment you save: hypothesis, parameters, dataset, period, results and weaknesses. Versions of one idea sit together so you can see what changed."
        actions={
          <Button variant="primary" asChild>
            <Link href="/lab/build">
              <Plus className="size-4" aria-hidden /> New experiment
            </Link>
          </Button>
        }
      />
      <JournalList />
    </div>
  );
}
