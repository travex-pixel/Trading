import type { Metadata } from "next";
import { CommandCentre } from "@/components/home/command-centre";

export const metadata: Metadata = { title: "Command Centre · EdgeLab" };

export default function HomePage() {
  return <CommandCentre />;
}
