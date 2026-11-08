"use client";

import { useSyncExternalStore } from "react";

let listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = 0;

function start(intervalMs: number) {
  if (timer) return;
  now = Date.now();
  timer = setInterval(() => {
    now = Date.now();
    for (const l of listeners) l();
  }, intervalMs);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start(60_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      listeners = new Set();
    }
  };
}

/** The current time, read on the client only (null on the server) and refreshed on an interval. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => now || Date.now(), () => null);
}
