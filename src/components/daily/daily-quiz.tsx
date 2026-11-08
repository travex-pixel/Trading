"use client";

/**
 * Today's Five: the daily calibration game. One question per screen, instant
 * feedback, a one-line lesson with evidence, a scorecard with streak and a
 * share line. Everything on screen comes from the engine.
 */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowRight, Check, Flame, RotateCcw, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Panel, PanelBody } from "@/components/ui/panel";
import { Cell, ProvenancePlate } from "@/components/ui/provenance";
import {
  buildDailyQuiz,
  pickQuizSeries,
  QUIZ_INSTRUMENTS,
  QUIZ_SIZE,
  QUIZ_TIMEFRAME,
  scoreQuiz,
  shareText,
  utcDateKey,
  verdictForScore,
  type DailyQuiz,
  type QuizChoice,
} from "@/lib/daily/quiz";
import { computeStreak, useDailyRecord } from "@/lib/daily/store";
import { fmtDate } from "@/lib/format";
import { useCandles } from "@/lib/market/client";
import { cn } from "@/lib/utils";
import { QuizFigureView } from "./quiz-figure";

/** Today's UTC date key, read on the client only (the server renders a neutral shell). Re-checks each minute so the day rolls over while the tab is open. */
function subscribeToday(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}
function useToday(): string | null {
  return useSyncExternalStore(
    subscribeToday,
    () => utcDateKey(),
    () => null,
  );
}

export function useTodaysQuiz(): {
  quiz: DailyQuiz | null;
  error: string | null;
  loading: boolean;
  date: string;
} {
  const date = useToday();
  const { series, error, loading } = useCandles(
    QUIZ_INSTRUMENTS,
    QUIZ_TIMEFRAME,
  );
  const built = useMemo(() => {
    if (!series || !date) return { quiz: null, error: null };
    try {
      return {
        quiz: buildDailyQuiz(date, pickQuizSeries(date, series)),
        error: null,
      };
    } catch (err) {
      return {
        quiz: null,
        error:
          err instanceof Error ? err.message : "Could not build today's quiz.",
      };
    }
  }, [series, date]);
  return {
    quiz: built.quiz,
    error: error ?? built.error,
    loading: (loading && !series) || !date,
    date: date ?? "",
  };
}

type Stage = "intro" | "play" | "result" | "review";

export function DailyQuizGame({ autoStart = false }: { autoStart?: boolean }) {
  const { quiz, error, loading, date } = useTodaysQuiz();
  const { record, saveAnswer, reset } = useDailyRecord();
  const day = record?.days[date] ?? null;
  const streak = record ? computeStreak(record, date) : 0;

  const answers = useMemo<Array<number | null>>(() => {
    const base = Array<number | null>(QUIZ_SIZE).fill(null);
    if (day) day.answers.forEach((a, i) => (base[i] = a));
    return base;
  }, [day]);
  const firstUnanswered = answers.findIndex((a) => a === null);
  const completed = day?.completedAt != null && firstUnanswered === -1;

  // Stage and index are undecided until the local record has loaded; the
  // first decision resumes where the player left off (or shows today's score).
  // A completion that happens during play never skips the final lesson,
  // because once decided the stage only changes through player actions.
  const [stageState, setStage] = useState<Stage | null>(
    autoStart ? "play" : null,
  );
  const [indexState, setIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const stage: Stage =
    stageState ??
    (record === null
      ? "intro"
      : completed
        ? "result"
        : firstUnanswered > 0
          ? "play"
          : "intro");
  const index =
    indexState ??
    (record !== null && !completed && firstUnanswered > 0
      ? firstUnanswered
      : 0);

  const scored = quiz ? scoreQuiz(quiz, answers) : null;

  const answer = useCallback(
    (choice: number) => {
      if (!quiz || revealed) return;
      // Pin the current index so the derived resume value cannot move the card under the player.
      setIndex(index);
      const next = [...answers];
      next[index] = choice;
      const { score } = scoreQuiz(quiz, next);
      saveAnswer(date, index, choice, QUIZ_SIZE, score);
      setRevealed(true);
    },
    [quiz, revealed, answers, index, saveAnswer, date],
  );

  const advance = useCallback(() => {
    if (!quiz) return;
    setRevealed(false);
    if (index + 1 >= quiz.questions.length) setStage("result");
    else setIndex(index + 1);
  }, [quiz, index]);

  // Keyboard: 1-4 to answer, Enter / Space to continue.
  useEffect(() => {
    if (stage !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
      )
        return;
      if (!revealed && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
      if (revealed && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, revealed, answer, advance]);

  if (error)
    return <ErrorState title="Today's Five is unavailable" body={error} />;
  if (loading || !quiz || record === null) return <QuizSkeleton />;

  if (stage === "intro") {
    return (
      <Intro quiz={quiz} streak={streak} onPlay={() => setStage("play")} />
    );
  }

  if (stage === "result" && scored) {
    return (
      <Result
        quiz={quiz}
        marks={scored.marks}
        streak={streak}
        onReview={() => setStage("review")}
        onReplay={() => {
          reset(date);
          setIndex(0);
          setRevealed(false);
          setStage("play");
        }}
      />
    );
  }

  if (stage === "review" && scored) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            Today&apos;s answers
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setStage("result")}>
            Back to score
          </Button>
        </div>
        {quiz.questions.map((q, i) => (
          <ReviewCard key={q.id} quiz={quiz} index={i} answer={answers[i]} />
        ))}
      </div>
    );
  }

  // The play screen is sized to the viewport so a question, its figure, the
  // answers and the lesson are always on screen together with nothing to
  // scroll. Phone: below the top bar and above the tab bar. Desktop: capped
  // so the card does not stretch into a wall of space.
  return (
    <div className="flex h-[calc(100dvh-10rem)] max-h-[760px] min-h-[520px] flex-col gap-3 lg:h-[calc(100dvh-4.5rem)]">
      <Progress
        total={quiz.questions.length}
        index={index}
        marks={quiz.questions.map((q, i) =>
          answers[i] === null ? null : answers[i] === q.answerIndex,
        )}
      />
      <QuestionCard
        key={quiz.questions[index].id}
        quiz={quiz}
        index={index}
        answer={answers[index]}
        revealed={revealed || answers[index] !== null}
        onAnswer={answer}
        onAdvance={advance}
        isLast={index + 1 >= quiz.questions.length}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Intro({
  quiz,
  streak,
  onPlay,
}: {
  quiz: DailyQuiz;
  streak: number;
  onPlay: () => void;
}) {
  return (
    <Panel className="quiz-enter overflow-hidden">
      <PanelBody className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="num text-xs text-ink-3">
              {fmtDate(Date.parse(quiz.date + "T00:00:00Z"))}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              Today&apos;s Five
            </h1>
          </div>
          {streak >= 2 ? <StreakBadge streak={streak} /> : null}
        </div>
        <p className="mt-3 max-w-[46ch] text-base text-ink-2 leading-6">
          Five real results from the lab, today on{" "}
          <span className="text-ink">{quiz.symbol}</span>. Can you tell an edge
          from luck? Everyone gets the same five today, and a fresh set
          tomorrow.
        </p>
        <ul className="mt-5 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
          {quiz.questions.map((q, i) => (
            <li key={q.id} className="flex items-center gap-2.5">
              <span className="num flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-2xs text-ink-3">
                {i + 1}
              </span>
              {q.topic}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="primary"
            size="lg"
            onClick={onPlay}
            className="sm:min-w-44"
          >
            Play · about 2 minutes
          </Button>
          <span className="text-xs text-ink-3">
            No sign-up, no penalties. Your score stays on this device.
          </span>
        </div>
      </PanelBody>
      <ProvenancePlate
        source={quiz.source}
        period={quiz.period}
        timeframe={quiz.timeframe}
        extra={
          <Cell
            label="Instrument"
            value={`${quiz.symbol} · ASX · ${quiz.currency}`}
          />
        }
      />
    </Panel>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-warn/40 bg-warn-dim px-2 py-0.5 text-xs font-medium text-warn">
      <Flame className="size-3.5" aria-hidden /> {streak}-day streak
    </span>
  );
}

function Progress({
  total,
  index,
  marks,
}: {
  total: number;
  index: number;
  marks: Array<boolean | null>;
}) {
  return (
    <ol
      className="flex items-center gap-2"
      aria-label={`Question ${index + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const m = marks[i];
        return (
          <li
            key={i}
            aria-current={i === index ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              m === true
                ? "bg-up"
                : m === false
                  ? "bg-down"
                  : i === index
                    ? "bg-annot"
                    : "bg-border",
            )}
          />
        );
      })}
      <li className="num ml-1 text-2xs text-ink-3" aria-hidden>
        {index + 1}/{total}
      </li>
    </ol>
  );
}

function QuestionCard({
  quiz,
  index,
  answer,
  revealed,
  onAnswer,
  onAdvance,
  isLast,
}: {
  quiz: DailyQuiz;
  index: number;
  answer: number | null;
  revealed: boolean;
  onAnswer: (i: number) => void;
  onAdvance: () => void;
  isLast: boolean;
}) {
  const q = quiz.questions[index];
  const correct = answer !== null && answer === q.answerIndex;
  return (
    <Panel className="quiz-enter flex min-h-0 flex-1 flex-col overflow-hidden">
      <PanelBody className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
        {/* Prompt */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink-3">
            {index + 1}. {q.topic}
          </span>
          {revealed && answer !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                correct ? "text-up" : "text-down",
              )}
            >
              {correct ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              {correct ? "Correct" : "Not quite"}
            </span>
          ) : null}
        </div>
        <h2 className="mt-1.5 text-[15px] font-medium leading-[1.35] text-ink text-pretty sm:text-lg sm:leading-7">
          {q.prompt}
        </h2>

        {/* Figure fills whatever height is left */}
        <div className="relative mt-3 min-h-[120px] flex-1">
          <QuizFigureView
            figure={q.figure}
            revealed={revealed}
            answerIndex={q.answerIndex}
            fill
          />
        </div>

        {/* Answers: one compact grid, two or three across */}
        <div
          className={cn(
            "mt-3 grid gap-2",
            q.choices.length === 3 ? "grid-cols-3" : "grid-cols-2",
          )}
          role="group"
          aria-label="Answers"
        >
          {q.choices.map((c, i) => (
            <Choice
              key={i}
              index={i}
              choice={c}
              revealed={revealed}
              isAnswer={i === q.answerIndex}
              chosen={answer === i}
              onPick={() => onAnswer(i)}
            />
          ))}
        </div>

        {/* Lesson slot: reserved before the answer so nothing jumps */}
        <div className="mt-3 flex min-h-[7.5rem] flex-col justify-end border-t border-hairline pt-3">
          {revealed ? (
            <div className="quiz-enter flex flex-col gap-3">
              <p className="text-sm leading-5 text-ink">{q.lesson}</p>
              <Button
                variant="primary"
                size="lg"
                onClick={onAdvance}
                className="w-full"
              >
                {isLast ? "See my score" : "Next question"}{" "}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : (
            <p className="text-xs leading-5 text-ink-3">
              Have a guess. There is no penalty, and the answer comes with the
              reason behind it.
              <span className="hidden sm:inline">
                {" "}
                Keys 1 to {q.choices.length} answer, Enter continues.
              </span>
            </p>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

function Choice({
  index,
  choice,
  revealed,
  isAnswer,
  chosen,
  onPick,
}: {
  index: number;
  choice: QuizChoice;
  revealed: boolean;
  isAnswer: boolean;
  chosen: boolean;
  onPick: () => void;
}) {
  const state = !revealed
    ? "idle"
    : isAnswer
      ? "correct"
      : chosen
        ? "wrong"
        : "muted";
  return (
    <button
      type="button"
      disabled={revealed}
      onClick={onPick}
      aria-pressed={chosen}
      className={cn(
        "flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors duration-150",
        state === "idle" &&
          "border-border bg-raised text-ink hover:border-border-strong hover:bg-hover active:bg-hover",
        state === "correct" && "border-up/60 bg-up-dim text-ink",
        state === "wrong" && "border-down/60 bg-down-dim text-ink",
        state === "muted" && "border-hairline text-ink-3",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {!revealed ? (
          <kbd className="num hidden size-5 shrink-0 items-center justify-center rounded border border-border text-2xs text-ink-3 sm:flex">
            {index + 1}
          </kbd>
        ) : null}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{choice.label}</span>
          {choice.detail && revealed ? (
            <span className="truncate text-xs text-ink-3">{choice.detail}</span>
          ) : null}
        </span>
      </span>
      {state === "correct" ? (
        <Check className="size-4 shrink-0 text-up" aria-hidden />
      ) : null}
      {state === "wrong" ? (
        <X className="size-4 shrink-0 text-down" aria-hidden />
      ) : null}
    </button>
  );
}

/** The static, fully revealed version used on the review screen, with the evidence lines and the Lab link. */
function ReviewCard({
  quiz,
  index,
  answer,
}: {
  quiz: DailyQuiz;
  index: number;
  answer: number | null;
}) {
  const q = quiz.questions[index];
  const correct = answer !== null && answer === q.answerIndex;
  return (
    <Panel className="overflow-hidden">
      <PanelBody className="p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink-3">
            {index + 1}. {q.topic}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              correct ? "text-up" : "text-down",
            )}
          >
            {correct ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <X className="size-3.5" aria-hidden />
            )}
            {correct ? "Correct" : "Not quite"}
          </span>
        </div>
        <h2 className="mt-2 text-sm font-medium leading-5 text-ink text-pretty">
          {q.prompt}
        </h2>
        <div className="mt-3 h-44">
          <QuizFigureView
            figure={q.figure}
            revealed
            answerIndex={q.answerIndex}
            fill
          />
        </div>
        <div
          className={cn(
            "mt-3 grid gap-2",
            q.choices.length === 3 ? "grid-cols-3" : "grid-cols-2",
          )}
          role="group"
          aria-label="Answers"
        >
          {q.choices.map((c, i) => (
            <Choice
              key={i}
              index={i}
              choice={c}
              revealed
              isAnswer={i === q.answerIndex}
              chosen={answer === i}
              onPick={() => {}}
            />
          ))}
        </div>
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-sm leading-5 text-ink">{q.lesson}</p>
          <ul className="mt-2 space-y-0.5">
            {q.evidence.map((e) => (
              <li key={e} className="num text-2xs text-ink-3">
                {e}
              </li>
            ))}
          </ul>
          {q.labCode ? (
            <Link
              href={`/lab/build?s=${q.labCode}`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-annot hover:underline underline-offset-2"
            >
              Open this experiment in the Lab{" "}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}

function Result({
  quiz,
  marks,
  streak,
  onReview,
  onReplay,
}: {
  quiz: DailyQuiz;
  marks: boolean[];
  streak: number;
  onReview: () => void;
  onReplay: () => void;
}) {
  const score = marks.filter(Boolean).length;
  const verdict = verdictForScore(score);
  const [shared, setShared] = useState<"idle" | "copied" | "shared">("idle");
  const [countdown, setCountdown] = useState(() => untilNextUtcDay());
  useEffect(() => {
    const t = setInterval(() => setCountdown(untilNextUtcDay()), 30_000);
    return () => clearInterval(t);
  }, []);

  const share = async () => {
    const text = shareText(quiz, marks, streak, window.location.origin);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShared("shared");
      } else {
        await navigator.clipboard.writeText(text);
        setShared("copied");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setShared("copied");
      } catch {
        // ignore
      }
    }
    setTimeout(() => setShared("idle"), 2500);
  };

  const labQuestion = quiz.questions.find((q) => q.labCode);

  return (
    <Panel className="quiz-enter overflow-hidden">
      <PanelBody className="p-5 sm:p-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs text-ink-3">
              Today&apos;s Five ·{" "}
              {fmtDate(Date.parse(quiz.date + "T00:00:00Z"))}
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="num-hero text-[56px] leading-none text-ink">
                {score}
              </span>
              <span className="num text-xl text-ink-3">/ {QUIZ_SIZE}</span>
            </div>
            <div
              className="mt-3 flex items-center gap-1.5"
              aria-label="Results by question"
            >
              {marks.map((m, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2.5 w-7 rounded-sm",
                    m ? "bg-up" : "bg-down",
                  )}
                  title={`${i + 1}. ${quiz.questions[i].topic}: ${m ? "correct" : "missed"}`}
                />
              ))}
            </div>
          </div>
          <div className="sm:max-w-[34ch]">
            <h2 className="text-base font-semibold text-ink">
              {verdict.title}
            </h2>
            <p className="mt-1 text-sm text-ink-2 leading-5">{verdict.body}</p>
            {streak >= 2 ? (
              <div className="mt-3">
                <StreakBadge streak={streak} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-3">
                Come back tomorrow to start a streak.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="primary" size="lg" onClick={share}>
            <Share2 className="size-4" aria-hidden />{" "}
            {shared === "copied"
              ? "Copied to clipboard"
              : shared === "shared"
                ? "Shared"
                : "Share your score"}
          </Button>
          <Button size="lg" onClick={onReview}>
            Review the answers
          </Button>
          {labQuestion?.labCode ? (
            <Button size="lg" asChild>
              <Link href={`/lab/build?s=${labQuestion.labCode}`}>
                Open today&apos;s strategy in the Lab
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4 text-xs text-ink-3">
          <span>
            New five in <span className="num text-ink-2">{countdown}</span>
          </span>
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Replay today
            (practice, not scored)
          </button>
        </div>
      </PanelBody>
      <ProvenancePlate
        source={quiz.source}
        period={quiz.period}
        timeframe={quiz.timeframe}
        extra={
          <Cell
            label="Instrument"
            value={`${quiz.symbol} · ASX · ${quiz.currency}`}
          />
        }
      />
    </Panel>
  );
}

function untilNextUtcDay(): string {
  const now = new Date();
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const ms = next - now.getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function QuizSkeleton() {
  return (
    <Panel aria-busy="true" aria-label="Loading today's quiz">
      <PanelBody className="p-5 sm:p-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-40" />
        <Skeleton className="mt-4 h-4 w-full max-w-md" />
        <Skeleton className="mt-6 h-11 w-44" />
      </PanelBody>
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */
/* Compact teaser for the Command Centre                                     */
/* ------------------------------------------------------------------------- */

export function DailyTeaser() {
  const { quiz, loading, date } = useTodaysQuiz();
  const { record } = useDailyRecord();
  const day = record?.days[date] ?? null;
  const streak = record ? computeStreak(record, date) : 0;
  const completed = day?.completedAt != null;
  const scored = quiz && day ? scoreQuiz(quiz, day.answers) : null;

  if (loading || !quiz || record === null) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-hairline bg-panel px-4 py-3">
        <div>
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>
    );
  }

  return (
    <Link
      href="/daily"
      className="group flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-hairline bg-panel px-4 py-3 transition-colors hover:border-border-strong hover:bg-hover"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">
            Today&apos;s Five
          </span>
          {streak >= 2 ? (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-warn">
              <Flame className="size-3" aria-hidden /> {streak}-day streak
            </span>
          ) : null}
        </div>
        {completed && scored ? (
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-2">
            <span className="num text-ink">
              {scored.score}/{QUIZ_SIZE}
            </span>
            <span className="flex items-center gap-1" aria-hidden>
              {scored.marks.map((m, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-4 rounded-sm",
                    m ? "bg-up" : "bg-down",
                  )}
                />
              ))}
            </span>
            <span className="text-ink-3">· review the answers</span>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-ink-2">
            Five real results. Can you tell an edge from luck? About 2 minutes.
          </p>
        )}
      </div>
      <span
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3.5 text-sm font-medium",
          completed ? "border border-border text-ink" : "bg-ink text-ground",
        )}
      >
        {completed ? "Review" : "Play"}{" "}
        <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}
