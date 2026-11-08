import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NavLinks, MobileTabBar } from "./nav";
import { Wordmark } from "./wordmark";
import { DataBadge } from "./data-badge";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Desktop rail */}
      <aside className="hidden lg:flex lg:flex-col lg:border-r lg:border-hairline lg:bg-panel lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex h-14 items-center px-5 border-b border-hairline">
          <Link href="/" className="flex items-center gap-2" aria-label="EdgeLab home">
            <Wordmark />
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 px-3 py-4">
          <Suspense fallback={null}>
            <NavLinks />
          </Suspense>
        </nav>
        <div className="px-5 py-4 border-t border-hairline">
          <DataBadge />
          <p className="mt-3 text-2xs leading-4 text-ink-3">Simulation only. No real money, no live orders.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b border-hairline bg-ground/95 px-4 backdrop-blur-sm">
        <Link href="/" aria-label="EdgeLab home">
          <Wordmark />
        </Link>
        <DataBadge compact />
      </header>

      <div className="min-w-0">
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-6">{children}</main>
      </div>

      <Suspense fallback={null}>
        <MobileTabBar />
      </Suspense>
    </div>
  );
}
