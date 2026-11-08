"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Flask,
  Globe,
  House,
  PlayCircle,
  Sword,
  Wallet,
  Lightning,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: House, mobile: true },
  {
    href: "/markets",
    label: "Markets",
    short: "Markets",
    icon: Globe,
    mobile: true,
  },
  {
    href: "/lab",
    label: "Strategies",
    short: "Strategies",
    icon: Flask,
    mobile: true,
  },
  {
    href: "/arena",
    label: "Bot Arena",
    short: "Arena",
    icon: Sword,
    mobile: true,
  },
  {
    href: "/paper",
    label: "Portfolio",
    short: "Portfolio",
    icon: Wallet,
    mobile: true,
  },
  {
    href: "/replay",
    label: "Trade Replay",
    short: "Replay",
    icon: PlayCircle,
    mobile: false,
  },
  {
    href: "/journal",
    label: "Research Journal",
    short: "Journal",
    icon: BookOpen,
    mobile: false,
  },
  {
    href: "/daily",
    label: "Today's Five",
    short: "Daily",
    icon: Lightning,
    mobile: false,
  },
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
                "flex h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm transition-colors duration-150",
                active
                  ? "bg-raised text-ink"
                  : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0",
                  active ? "text-annot" : "text-ink-3",
                )}
                weight={active ? "fill" : "regular"}
                aria-hidden
              />
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
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-panel/90 backdrop-blur-xl"
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
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors duration-150",
                  active ? "text-annot" : "text-ink-3 active:text-ink-2",
                )}
              >
                <Icon
                  className="size-[26px]"
                  weight={active ? "fill" : "regular"}
                  aria-hidden
                />
                <span>{"short" in item ? item.short : item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
