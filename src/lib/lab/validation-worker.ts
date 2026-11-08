/// <reference lib="webworker" />
/**
 * Web Worker that runs the slow validation suite (walk-forward and parameter
 * sensitivity) off the main thread so the builder stays responsive.
 */

import { sensitivity, walkForward } from "@/lib/quant/validation";
import type { CandleSeries } from "@/lib/quant/types";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { Period } from "@/lib/quant/validation";

export interface ValidationRequest {
  id: number;
  config: StrategyConfig;
  series: CandleSeries[];
  period: Period;
  folds: number;
}

export interface ValidationResponse {
  id: number;
  ok: boolean;
  walkForward: ReturnType<typeof walkForward> | null;
  sensitivity: ReturnType<typeof sensitivity>;
  error?: string;
}

self.onmessage = (event: MessageEvent<ValidationRequest>) => {
  const { id, config, series, period, folds } = event.data;
  try {
    const tunable = config.params.kind !== "buy_and_hold" && config.params.kind !== "random_baseline";
    const wf = tunable ? walkForward(config, series, period, { folds }) : null;
    const sens = tunable ? sensitivity(config, series, period) : [];
    const response: ValidationResponse = { id, ok: true, walkForward: wf, sensitivity: sens };
    self.postMessage(response);
  } catch (err) {
    const response: ValidationResponse = { id, ok: false, walkForward: null, sensitivity: [], error: err instanceof Error ? err.message : "Validation failed." };
    self.postMessage(response);
  }
};
