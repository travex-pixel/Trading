import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { buildDailyQuiz, QUIZ_SIZE, scoreQuiz, shareText, utcDateKey } from "./quiz";
import { computeStreak } from "./store";

const series = demoSeries("BTC", "4h");

describe("daily quiz", () => {
  it("is deterministic for a date and different across dates", () => {
    const a = buildDailyQuiz("2026-11-08", series);
    const b = buildDailyQuiz("2026-11-08", series);
    const c = buildDailyQuiz("2026-11-09", series);
    expect(a.seed).toBe(b.seed);
    expect(a.questions.map((q) => q.prompt)).toEqual(b.questions.map((q) => q.prompt));
    expect(a.period).not.toEqual(c.period);
  });

  it("always has five answerable questions with figures and lessons", () => {
    for (const date of ["2026-11-08", "2026-01-15", "2026-06-30", "2027-03-02"]) {
      const quiz = buildDailyQuiz(date, series);
      expect(quiz.questions).toHaveLength(QUIZ_SIZE);
      for (const q of quiz.questions) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(q.choices.length);
        expect(q.lesson.length).toBeGreaterThan(20);
        if (q.figure.type === "curves") for (const s of q.figure.series) expect(s.points.length).toBeGreaterThan(10);
        if (q.figure.type === "price") expect(q.figure.closes.length).toBeGreaterThan(5);
      }
      expect(new Set(quiz.questions.map((q) => q.kind)).size).toBe(QUIZ_SIZE);
    }
  });

  it("marks the random curve correctly", () => {
    const quiz = buildDailyQuiz("2026-11-08", series);
    const q = quiz.questions.find((x) => x.kind === "spot_the_random")!;
    expect(q.figure.type).toBe("curves");
    if (q.figure.type === "curves") expect(q.figure.series[q.answerIndex].revealName).toContain("Random");
  });

  it("scores and shares", () => {
    const quiz = buildDailyQuiz("2026-11-08", series);
    const perfect = quiz.questions.map((q) => q.answerIndex);
    expect(scoreQuiz(quiz, perfect).score).toBe(QUIZ_SIZE);
    const none = quiz.questions.map((q) => (q.answerIndex + 1) % q.choices.length);
    expect(scoreQuiz(quiz, none).score).toBe(0);
    const text = shareText(quiz, [true, false, true, true, true], 3, "https://edgelab.app");
    expect(text).toContain("4/5");
    expect(text).toContain("3-day streak");
    expect(utcDateKey(Date.UTC(2026, 10, 8, 23, 59))).toBe("2026-11-08");
  });
});

describe("streak", () => {
  const day = () => ({ answers: [0, 0, 0, 0, 0], score: 3, completedAt: 1 });
  it("counts consecutive completed days ending today or yesterday", () => {
    expect(computeStreak({ v: 1, days: { "2026-11-08": day(), "2026-11-07": day(), "2026-11-06": day() } }, "2026-11-08")).toBe(3);
    expect(computeStreak({ v: 1, days: { "2026-11-07": day(), "2026-11-06": day() } }, "2026-11-08")).toBe(2);
    expect(computeStreak({ v: 1, days: { "2026-11-05": day() } }, "2026-11-08")).toBe(0);
    expect(computeStreak({ v: 1, days: {} }, "2026-11-08")).toBe(0);
  });
});
