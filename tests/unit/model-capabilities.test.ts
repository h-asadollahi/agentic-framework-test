import { describe, expect, it } from "vitest";
import { modelSupportsTemperature } from "../../src/providers/model-router.js";

describe("model temperature capabilities", () => {
  it("returns false for OpenAI GPT-5 family", () => {
    expect(modelSupportsTemperature("openai:gpt-5-mini")).toBe(false);
    expect(modelSupportsTemperature("openai:gpt-5")).toBe(false);
    expect(modelSupportsTemperature("openai:gpt-5.2")).toBe(false);
  });

  it("returns false for OpenAI o-series reasoning models", () => {
    expect(modelSupportsTemperature("openai:o3")).toBe(false);
    expect(modelSupportsTemperature("openai:o4-mini")).toBe(false);
  });

  it("returns true for non-reasoning OpenAI models", () => {
    expect(modelSupportsTemperature("openai:gpt-4o")).toBe(true);
  });

  it("returns true for Anthropic and Google models", () => {
    expect(modelSupportsTemperature("anthropic:claude-sonnet-4-6")).toBe(true);
    expect(modelSupportsTemperature("google:gemini-2.5-pro")).toBe(true);
  });
});
