import type { Metadata } from "next";
import { MarketsBrowser } from "@/components/market/markets-browser";

export const metadata: Metadata = { title: "Markets", description: "ASX, US and crypto instruments with market status and data provenance." };

export default function MarketsPage() {
  return <MarketsBrowser />;
}
