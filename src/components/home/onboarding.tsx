"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const KEY = "edgelab:v1:onboarded";

const STEPS = [
  {
    title: "Choose a strategy",
    body: "Start from the library. Each one says in plain English what it does and where it breaks.",
    href: "/lab",
    cta: "Library",
  },
  {
    title: "Run a backtest",
    body: "Adjust the controls and watch the result update. Fills happen at the next bar's open, after fees.",
    href: "/lab/build",
    cta: "Build",
  },
  {
    title: "Read the result",
    body: "Max drawdown is the biggest fall from a previous high. The verdict badge says whether the edge is real or just lucky.",
    href: "/lab/build?kind=ma_crossover",
    cta: "Example",
  },
  {
    title: "Find the weaknesses",
    body: "The Validation tab re-chooses parameters on past data only and trades them forward. Overfit ideas fall apart here.",
    href: "/lab/build?kind=ma_crossover",
    cta: "Validate",
  },
  {
    title: "Paper trade it",
    body: "Follow a strategy forward with virtual capital. Every position is simulated and nothing is ever sent to an exchange.",
    href: "/paper",
    cta: "Paper",
  },
];

const EVENT = "edgelab:onboarding";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}
/** null on the server and during hydration, so the panel never flashes. */
function getServerSnapshot(): boolean | null {
  return null;
}

export function useOnboarding() {
  const dismissed = useSyncExternalStore<boolean | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const show = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { dismissed, dismiss, show };
}

export function GuideSheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Five steps from idea to paper trade"
      description="Most strategies fail. EdgeLab exists to show you why before it costs anything."
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="lg"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Got it
          </Button>
        </div>
      }
    >
      <ol className="divide-y divide-hairline">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 py-3">
            <span
              className="num flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-2xs text-ink-3"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium leading-5 text-ink">
                {s.title}
              </h3>
              <p className="mt-0.5 text-xs leading-4 text-ink-2">{s.body}</p>
              <Link
                href={s.href}
                onClick={onClose}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-annot underline-offset-2 hover:underline"
              >
                {s.cta} <ArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
