import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Sometype_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

const sometype = Sometype_Mono({
  variable: "--font-sometype",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "EdgeLab", template: "%s · EdgeLab" },
  description: "Find an edge. Prove it. Beat the market. A quantitative trading research lab with honest backtesting, paper trading and strategy competitions.",
  applicationName: "EdgeLab",
};

export const viewport: Viewport = {
  themeColor: "#0c0d10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${schibsted.variable} ${sometype.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
