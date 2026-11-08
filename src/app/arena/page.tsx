import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { CompetitionList } from "@/components/arena/competition-list";

export const metadata: Metadata = { title: "Bot Arena" };

export default function ArenaPage() {
  return (
    <div>
      <PageHeader
        title="Bot Arena"
        description="Strategies compete on the same market, dates, capital and costs. Ranked by return per unit of risk, because anyone can get lucky once."
        actions={
          <Button variant="primary" asChild>
            <Link href="/arena/new">
              <Plus className="size-4" aria-hidden /> Create competition
            </Link>
          </Button>
        }
      />
      <CompetitionList />
    </div>
  );
}
