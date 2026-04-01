import { describe, it, expect } from "vitest";
import {
  shouldAttemptRouteLearning,
  resolveUnknownSubtaskStrategy,
  shouldUseMatchedLearnedRoute,
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

  it("does not attempt route learning for build/integration implementation requests", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description:
          "Create an MCP server for our internal CRM API so agents can fetch customer lifecycle data",
      },
      false
    );

    expect(strategy).toBe("llm-fallback");
    expect(
      shouldAttemptRouteLearning({
        agentId: "general",
        description:
          "Create an MCP server for our internal CRM API so agents can fetch customer lifecycle data",
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

  it("does not use learned routes for creative general tasks that lack retrieval intent", () => {
    const subtask = {
      agentId: "general",
      description:
        "Define a single, cohesive campaign concept that anchors on the product envelope and brand voice.",
    };

    expect(shouldUseMatchedLearnedRoute(subtask)).toBe(false);
    expect(
      resolveUnknownSubtaskStrategy(subtask, true, { allowLearnedRoute: false })
    ).toBe("llm-fallback");
  });

  it("still allows learned routes for explicit catalog/data retrieval prompts", () => {
    const subtask = {
      agentId: "general",
      description: "List all available dimensions and metrics in Mapp Intelligence",
    };

    expect(shouldUseMatchedLearnedRoute(subtask)).toBe(true);
    expect(
      resolveUnknownSubtaskStrategy(subtask, true, { allowLearnedRoute: true })
    ).toBe("use-learned-route");
  });

  it("does not route-learn for general synthesis/consolidation tasks", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description:
          "Consolidate the five KPI pulls into a single quarter performance narrative with recommendations",
      },
      false
    );

    expect(strategy).toBe("llm-fallback");
    expect(
      shouldAttemptRouteLearning({
        agentId: "general",
        description:
          "Consolidate the five KPI pulls into a single quarter performance narrative with recommendations",
      })
    ).toBe(false);
  });

  it("treats normalize/present formatting subtasks as synthesis instead of route-learning", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description:
          "Normalize and present the returned dimensions/metrics list in a concise, scannable format grouped and de-duplicated for marketing use.",
      },
      false
    );

    expect(strategy).toBe("llm-fallback");
    expect(
      shouldAttemptRouteLearning({
        agentId: "general",
        description:
          "Normalize and present the returned dimensions/metrics list in a concise, scannable format grouped and de-duplicated for marketing use.",
      })
    ).toBe(false);
  });

  it("does not route-learn synthesis subtasks when deterministic route context exists", () => {
    const strategy = resolveUnknownSubtaskStrategy(
      {
        agentId: "general",
        description:
          "Present the deterministic dimensions and metrics result in a readable grouped format.",
      },
      false,
      { hasDeterministicRouteContext: true }
    );

    expect(strategy).toBe("llm-fallback");
  });
});
