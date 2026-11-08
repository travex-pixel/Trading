"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FlaskConical, Globe2, Home, PlayCircle, Swords, Wallet, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home, mobile: true },
  { href: "/markets", label: "Markets", short: "Markets", icon: Globe2, mobile: true },
  { href: "/lab", label: "Strategies", short: "Strategies", icon: FlaskConical, mobile: true },
  { href: "/arena", label: "Bot Arena", short: "Arena", icon: Swords, mobile: true },
  { href: "/paper", label: "Portfolio", short: "Portfolio", icon: Wallet, mobile: true },
  { href: "/replay", label: "Trade Replay", short: "Replay", icon: PlayCircle, mobile: false },
  { href: "/journal", label: "Research Journal", short: "Journal", icon: BookOpen, mobile: false },
  { href: "/daily", label: "Today's Five", short: "Daily", icon: Zap, mobile: false },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-sm transition-colors duration-150",
                active ? "bg-raised text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-annot" : "text-ink-3")} strokeWidth={1.75} aria-hidden />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => i.mobile);
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-panel/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-14 flex-col items-center justify-center gap-1 text-2xs", active ? "text-ink" : "text-ink-3")}
              >
                <Icon className={cn("size-5", active ? "text-annot" : "")} strokeWidth={1.75} aria-hidden />
                <span>{"short" in item ? item.short : item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
