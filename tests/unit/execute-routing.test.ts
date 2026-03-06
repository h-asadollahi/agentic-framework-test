import { describe, it, expect } from "vitest";
import {
  shouldAttemptRouteLearning,
  resolveUnknownSubtaskStrategy,
} from "../../src/trigger/execute-routing.js";

describe("execute routing strategy", () => {
  it("uses learned route when one exists", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description: "Get conversion metrics for Q1 campaign",
      },
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

  it("uses learned route for cohort-like unknown tasks when a route exists", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description: "How is our VIP cohort performing this quarter?",
      },
      true
    );

    expect(strategy).toBe("use-learned-route");
  });
});
