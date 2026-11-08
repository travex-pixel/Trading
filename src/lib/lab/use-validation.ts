"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandleSeries } from "@/lib/quant/types";
import type { Period, SensitivityReport, WalkForwardReport } from "@/lib/quant/validation";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { ValidationRequest, ValidationResponse } from "./validation-worker";

export interface ValidationState {
  status: "idle" | "running" | "done" | "error";
  walkForward: WalkForwardReport | null;
  sensitivity: SensitivityReport[];
  error: string | null;
  /** The run id the current results belong to. */
  forKey: string | null;
}

const IDLE: ValidationState = { status: "idle", walkForward: null, sensitivity: [], error: null, forKey: null };

export function useValidation() {
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [state, setState] = useState<ValidationState>(IDLE);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((config: StrategyConfig, series: CandleSeries[], period: Period, key: string, folds = 4) => {
    const id = ++seq.current;
    setState({ status: "running", walkForward: null, sensitivity: [], error: null, forKey: key });
    const handle = (res: ValidationResponse) => {
      if (res.id !== seq.current) return;
      setState(res.ok ? { status: "done", walkForward: res.walkForward, sensitivity: res.sensitivity, error: null, forKey: key } : { ...IDLE, status: "error", error: res.error ?? "Validation failed.", forKey: key });
    };
    try {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./validation-worker.ts", import.meta.url));
      }
      const worker = workerRef.current;
      worker.onmessage = (e: MessageEvent<ValidationResponse>) => handle(e.data);
      worker.onerror = () => {
        // Fall back to the main thread if the worker cannot start.
        workerRef.current?.terminate();
        workerRef.current = null;
        void import("@/lib/quant/validation").then(({ walkForward, sensitivity }) => {
          const tunable = config.params.kind !== "buy_and_hold" && config.params.kind !== "random_baseline";
          handle({ id, ok: true, walkForward: tunable ? walkForward(config, series, period, { folds }) : null, sensitivity: tunable ? sensitivity(config, series, period) : [] });
        });
      };
      const request: ValidationRequest = { id, config, series, period, folds };
      worker.postMessage(request);
    } catch {
      void import("@/lib/quant/validation").then(({ walkForward, sensitivity }) => {
        const tunable = config.params.kind !== "buy_and_hold" && config.params.kind !== "random_baseline";
        handle({ id, ok: true, walkForward: tunable ? walkForward(config, series, period, { folds }) : null, sensitivity: tunable ? sensitivity(config, series, period) : [] });
      });
    }
  }, []);

  const reset = useCallback(() => {
    seq.current++;
    setState(IDLE);
  }, []);

  return { state, run, reset };
}
