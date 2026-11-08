"use client";

/**
 * Local record of played quizzes: answers per date, and the streak.
 * Browser-local only, validated on read.
 */

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

const KEY = "edgelab:v1:daily";
const EVENT = "edgelab:daily";

const recordSchema = z.object({
  v: z.literal(1),
  days: z.record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.object({
      answers: z.array(z.number().int().min(0).max(5).nullable()).max(5),
      score: z.number().int().min(0).max(5),
      completedAt: z.number().nullable(),
    }),
  ),
});

export type DailyRecord = z.infer<typeof recordSchema>;
export type DayResult = DailyRecord["days"][string];

const EMPTY: DailyRecord = { v: 1, days: {} };
let cachedRaw: string | null = null;
let cached: DailyRecord = EMPTY;

function read(): DailyRecord {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (!raw) return (cached = EMPTY);
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    return (cached = parsed.success ? parsed.data : EMPTY);
  } catch {
    return EMPTY;
  }
}

function write(record: DailyRecord): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // ignore quota errors; the game still works in memory for this session
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Consecutive days (ending today or yesterday) with a completed quiz. */
export function computeStreak(record: DailyRecord, today: string): number {
  const completed = new Set(Object.entries(record.days).filter(([, d]) => d.completedAt !== null).map(([k]) => k));
  if (completed.size === 0) return 0;
  const day = (offset: number) => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  let offset = completed.has(today) ? 0 : completed.has(day(1)) ? 1 : -1;
  if (offset === -1) return 0;
  let streak = 0;
  while (completed.has(day(offset))) {
    streak++;
    offset++;
  }
  return streak;
}

export function useDailyRecord() {
  const record = useSyncExternalStore<DailyRecord | null>(subscribe, read, () => null);
  const saveAnswer = useCallback((date: string, index: number, answer: number, total: number, score: number) => {
    const current = read();
    const day = current.days[date] ?? { answers: Array<number | null>(total).fill(null), score: 0, completedAt: null };
    const answers = [...day.answers];
    while (answers.length < total) answers.push(null);
    answers[index] = answer;
    const completed = answers.every((a) => a !== null);
    write({ v: 1, days: { ...current.days, [date]: { answers, score, completedAt: completed ? Date.now() : null } } });
  }, []);
  const reset = useCallback((date: string) => {
    const current = read();
    const days = { ...current.days };
    delete days[date];
    write({ v: 1, days });
  }, []);
  return { record, saveAnswer, reset };
}
