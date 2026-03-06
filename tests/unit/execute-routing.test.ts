import { describe, it, expect } from "vitest";
import {
  shouldAttemptRouteLearning,
  resolveUnknownSubtaskStrategy,
  isCohortOrientedSubtask,
  deriveCohortInputFromText,
} from "../../src/trigger/execute-routing.js";

describe("execute routing strategy", () => {
  it("uses learned route when one exists", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description: "Get conversion metrics for Q1 campaign",
      },
      true,
      true
    );

    expect(strategy).toBe("use-learned-route");
  });

  it("attempts route learning for data-oriented unknown tasks", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description: "Fetch competitor ad spend report from API",
      },
      false,
      false
    );

    expect(strategy).toBe("learn-new-route");
    expect(
      shouldAttemptRouteLearning({
        agentId: "general",
        description: "Fetch competitor ad spend report from API",
      })
    ).toBe(true);
  });

  it("falls back to llm for non-data unknown tasks", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description: "Draft a launch announcement email",
      },
      false,
      false
    );

    expect(strategy).toBe("llm-fallback");
    expect(
      shouldAttemptRouteLearning({
        agentId: "general",
        description: "Draft a launch announcement email",
      })
    ).toBe(false);
  });

  it("prefers cohort monitor for cohort-like unknown tasks", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description: "How is our VIP cohort performing this quarter?",
      },
      true,
      true
    );

    expect(strategy).toBe("use-cohort-monitor");
    expect(
      isCohortOrientedSubtask({
        agentId: "general",
        description: "How is our VIP cohort performing this quarter?",
      })
    ).toBe(true);
  });

  it("derives cohort input from natural language", () => {
    const input = deriveCohortInputFromText(
      "How is our VIP cohort retention performing this quarter?"
    );

    expect(input).toEqual({
      cohortId: "vip",
      metric: "retention",
      timeRange: "90d",
      compareBaseline: true,
    });
  });
});
