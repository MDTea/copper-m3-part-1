import type { ModelId } from "@/lib/ai/models";

// US dollars per million tokens: Google's list prices as of 2026-11.
// Billing may differ slightly; these are for cost estimates.
export const PRICING: Record<ModelId, { input: number; output: number }> = {
  // 3.8 Flash's list price doubles on 2027-01-01 (to 1.5 in, 7.5 out).
  "google/gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "google/gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
};

export function costUsd(
  model: ModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[model];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
