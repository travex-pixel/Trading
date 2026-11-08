"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

const KEY = "edgelab:v1:onboarded";

const STEPS = [
  { title: "Choose a strategy", body: "Start from the library. Each one says in plain English what it does and where it breaks.", href: "/lab", cta: "Library" },
  { title: "Run a backtest", body: "Adjust the controls and watch the result update. Fills happen at the next bar's open, after fees.", href: "/lab/build", cta: "Build" },
  { title: "Read the result", body: "Max drawdown is the biggest fall from a previous high. The verdict badge says whether the edge is real or just lucky.", href: "/lab/build?kind=ma_crossover", cta: "Example" },
  { title: "Find the weaknesses", body: "The Validation tab re-chooses parameters on past data only and trades them forward. Overfit ideas fall apart here.", href: "/lab/build?kind=ma_crossover", cta: "Validate" },
  { title: "Paper trade it", body: "Follow a strategy forward with virtual capital. Every position is simulated and nothing is ever sent to an exchange.", href: "/paper", cta: "Paper" },
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
  const dismissed = useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot);
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

export function OnboardingPanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Panel aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-4 px-4 pt-3.5 pb-3 border-b border-hairline">
        <div>
          <h2 id="onboarding-title" className="text-sm font-semibold text-ink leading-5">
            Five steps from idea to paper trade
          </h2>
          <p className="mt-0.5 text-xs text-ink-3 leading-4">Most strategies fail. EdgeLab exists to show you why before it costs anything.</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss guide" className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ol className="divide-y divide-hairline sm:grid sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 px-4 py-3 sm:flex-col sm:gap-2">
            <span className="num mt-px shrink-0 text-xs text-ink-3 sm:text-2xs" aria-hidden>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-ink leading-5">{s.title}</h3>
              <p className="mt-0.5 text-xs text-ink-2 leading-4">{s.body}</p>
              <Link href={s.href} className="mt-1.5 inline-block text-xs text-annot underline-offset-2 hover:underline">
                {s.cta} →
              </Link>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-end border-t border-hairline px-4 py-2.5">
        <Button size="sm" variant="primary" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </Panel>
  );
}
