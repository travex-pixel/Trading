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

const DESCRIPTION = "Find an edge. Prove it. Beat the market. A quantitative trading research lab with honest backtesting, paper trading and strategy competitions.";

/**
 * Absolute base for link previews. WhatsApp and Messenger ignore relative
 * image URLs, so every og:image must be absolute. Vercel supplies the
 * production host automatically; NEXT_PUBLIC_SITE_URL overrides it for a
 * custom domain. The value is a public address, not a secret.
 */
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "EdgeLab", template: "%s · EdgeLab" },
  description: DESCRIPTION,
  applicationName: "EdgeLab",
  openGraph: {
    type: "website",
    siteName: "EdgeLab",
    title: "EdgeLab",
    description: DESCRIPTION,
    locale: "en_AU",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "EdgeLab",
    description: DESCRIPTION,
  },
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
