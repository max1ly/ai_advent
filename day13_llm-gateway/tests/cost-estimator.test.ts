import { describe, it, expect } from "vitest";
import { estimate, estimateTokens } from "../src/cost/estimator.js";

describe("cost estimator", () => {
  it("calculates deepseek-chat cost correctly", () => {
    const result = estimate({
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      model: "deepseek-chat",
    });
    expect(result.costUsd).toBe(1.37);
  });

  it("calculates deepseek-reasoner cost correctly", () => {
    const result = estimate({
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      model: "deepseek-reasoner",
    });
    expect(result.costUsd).toBe(2.74);
  });

  it("handles small token counts with sub-cent precision", () => {
    const result = estimate({
      promptTokens: 10,
      completionTokens: 20,
      model: "deepseek-chat",
    });
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.costUsd).toBeLessThan(0.001);
  });

  it("returns 0 for unknown model", () => {
    const result = estimate({
      promptTokens: 100,
      completionTokens: 100,
      model: "unknown-model",
    });
    expect(result.costUsd).toBe(0);
  });

  it("estimates tokens from text length", () => {
    const tokens = estimateTokens("hello world");
    expect(tokens).toBe(Math.ceil(11 / 4));
  });
});
