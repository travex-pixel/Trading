import type { Metadata } from "next";
import { DailyQuizGame } from "@/components/daily/daily-quiz";

export const metadata: Metadata = {
  title: "Today's Five",
  description: "Five real backtest results a day. Can you tell an edge from luck?",
};

export default function DailyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <DailyQuizGame />
    </div>
  );
}
