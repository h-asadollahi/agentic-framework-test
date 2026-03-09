import { describe, it, expect } from "vitest";
import {
  buildRejectedCognitionResult,
  detectCognitionGuardrailRejection,
} from "../../src/trigger/cognition-guardrails.js";

describe("cognition guardrail rejection", () => {
  it("rejects competitor-focused prompts", () => {
    const decision = detectCognitionGuardrailRejection(
      "Compare our campaign performance against our main competitor."
    );

    expect(decision.rejected).toBe(true);
    expect(decision.reason).toMatch(/competitor/i);
  });

  it("rejects clearly non-marketing prompts", () => {
    const decision = detectCognitionGuardrailRejection(
      "What is the weather in Berlin tomorrow?"
    );

    expect(decision.rejected).toBe(true);
    expect(decision.reason).toMatch(/outside/i);
  });

  it("allows normal marketing prompts", () => {
    const decision = detectCognitionGuardrailRejection(
      "Analyze conversion trend by channel over the last 30 days."
    );

    expect(decision.rejected).toBe(false);
  });

  it("builds a rejected cognition result with no subtasks", () => {
    const result = buildRejectedCognitionResult("Out of scope");

    expect(result.rejected).toBe(true);
    expect(result.subtasks).toEqual([]);
    expect(result.rejectionReason).toBe("Out of scope");
  });
});
