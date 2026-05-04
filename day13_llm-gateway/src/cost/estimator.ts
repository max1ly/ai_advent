// Snapshot of DeepSeek pricing as of 2026-05-03. Update when the public page changes.
const PRICES_USD_PER_MTOKEN: Record<string, { input: number; output: number }> =
  {
    "deepseek-chat": { input: 0.27, output: 1.1 },
    "deepseek-reasoner": { input: 0.55, output: 2.19 },
  };

export function estimate(usage: {
  promptTokens: number;
  completionTokens: number;
  model: string;
}): { costUsd: number } {
  const prices = PRICES_USD_PER_MTOKEN[usage.model];
  if (!prices) {
    return { costUsd: 0 };
  }

  const inputCost = (usage.promptTokens / 1_000_000) * prices.input;
  const outputCost = (usage.completionTokens / 1_000_000) * prices.output;
  const costUsd =
    Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;

  return { costUsd };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
