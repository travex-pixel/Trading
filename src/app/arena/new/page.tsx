import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/panel";
import { NewCompetition } from "@/components/arena/new-competition";

export const metadata: Metadata = { title: "New competition" };

export default function NewCompetitionPage() {
  return (
    <div>
      <PageHeader title="Create a competition" description="Set the rules once. Every competitor, yours included, runs under them." />
      <NewCompetition />
    </div>
  );
}
