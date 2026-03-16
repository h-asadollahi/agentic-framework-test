import { describe, expect, it } from "vitest";
import { constrainDeterministicSingleRouteSynthesis } from "../../src/trigger/think.js";
import type { CognitionResult } from "../../src/core/types.js";

describe("think deterministic-route synthesis constraint", () => {
  it("removes redundant synthesis general subtask for single deterministic route", () => {
    const input: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Fetch monthly API usage from MCP route.",
          input: { routeId: "route-007" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "general",
          description: "Summarize the route result for the marketer.",
          input: {},
          dependencies: ["task-1"],
          priority: "medium",
        },
      ],
      reasoning: "fetch + summarize",
      plan: "fetch then summarize",
      rejected: false,
    };

    const constrained = constrainDeterministicSingleRouteSynthesis(input);
    expect(constrained.subtasks).toHaveLength(1);
    expect(constrained.subtasks[0].id).toBe("task-1");
    expect(constrained.reasoning).toContain(
      "Deterministic-route optimization"
    );
  });

  it("does not remove synthesis when deterministic route count is not one", () => {
    const input: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Fetch monthly API usage from MCP route.",
          input: { routeId: "route-007" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "api-fetcher",
          description: "Fetch daily KPI trend from API route.",
          input: { routeId: "route-001" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-3",
          agentId: "general",
          description: "Summarize results.",
          input: {},
          dependencies: ["task-1", "task-2"],
          priority: "medium",
        },
      ],
      reasoning: "two routes + summary",
      plan: "multi-route",
      rejected: false,
    };

    const constrained = constrainDeterministicSingleRouteSynthesis(input);
    expect(constrained.subtasks).toHaveLength(3);
  });

  it("keeps plan unchanged when non-synthesis general task exists", () => {
    const input: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Fetch monthly API usage from MCP route.",
          input: { routeId: "route-007" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "general",
          description: "Call external CRM and mutate records.",
          input: {},
          dependencies: ["task-1"],
          priority: "high",
        },
      ],
      reasoning: "fetch + mutate",
      plan: "fetch then mutate",
      rejected: false,
    };

    const constrained = constrainDeterministicSingleRouteSynthesis(input);
    expect(constrained.subtasks).toHaveLength(2);
  });

  it("removes normalization/presentation follow-up for single deterministic MCP route", () => {
    const input: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Retrieve all available dimensions and metrics from Mapp Intelligence.",
          input: { routeId: "route-002" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "general",
          description:
            "Normalize and present the returned dimensions/metrics list in a concise, scannable format grouped and de-duplicated.",
          input: { routeId: "route-002" },
          dependencies: ["task-1"],
          priority: "medium",
        },
      ],
      reasoning: "fetch then normalize",
      plan: "retrieve route result and format it",
      rejected: false,
    };

    const constrained = constrainDeterministicSingleRouteSynthesis(input);
    expect(constrained.subtasks).toHaveLength(1);
    expect(constrained.subtasks[0].id).toBe("task-1");
    expect(constrained.reasoning).toContain(
      "Deterministic-route optimization"
    );
  });
});
