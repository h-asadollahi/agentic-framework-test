import { describe, expect, it } from "vitest";
import {
  buildDeterministicAgencyFastPathSummary,
  shouldSkipSynthesisSubtaskForDeterministicRoute,
} from "../../src/trigger/execute.js";
import type { AgentResult, CognitionResult } from "../../src/core/types.js";

function okResult(output: unknown, durationMs = 1000): AgentResult {
  return {
    success: true,
    output,
    modelUsed: "test",
    durationMs,
  };
}

describe("execute deterministic agency fast path", () => {
  it("returns fast-path summary for one deterministic route + synthesis subtask", () => {
    const cognitionResult: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Fetch monthly API usage from Mapp via MCP route.",
          input: { routeId: "route-007" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "general",
          description: "Summarize the API usage result in concise business language.",
          input: {},
          dependencies: ["task-1"],
          priority: "medium",
        },
      ],
      reasoning: "deterministic route + synthesis",
      plan: "fetch then summarize",
      rejected: false,
    };

    const fastPath = buildDeterministicAgencyFastPathSummary(cognitionResult, [
      {
        subtaskId: "task-1",
        agentId: "mcp-fetcher",
        result: okResult("usage payload", 1600),
      },
      {
        subtaskId: "task-2",
        agentId: "general",
        result: okResult("summary text", 10),
      },
    ]);

    expect(fastPath).not.toBeNull();
    expect(fastPath?.routeAgentId).toBe("mcp-fetcher");
    expect(fastPath?.summary).toContain("Deterministic fast path");
    expect(fastPath?.summary).toContain("mcp-fetcher");
  });

  it("returns null when multiple deterministic route agents are present", () => {
    const cognitionResult: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Fetch usage",
          input: {},
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "api-fetcher",
          description: "Fetch extra analytics",
          input: {},
          dependencies: [],
          priority: "medium",
        },
      ],
      reasoning: "two deterministic tasks",
      plan: "not a single route case",
      rejected: false,
    };

    const fastPath = buildDeterministicAgencyFastPathSummary(cognitionResult, [
      {
        subtaskId: "task-1",
        agentId: "mcp-fetcher",
        result: okResult("ok"),
      },
      {
        subtaskId: "task-2",
        agentId: "api-fetcher",
        result: okResult("ok"),
      },
    ]);

    expect(fastPath).toBeNull();
  });

  it("returns null when non-deterministic subtask is not synthesis-like", () => {
    const cognitionResult: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "Fetch usage",
          input: {},
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
      reasoning: "unsafe extra step",
      plan: "fetch + mutate",
      rejected: false,
    };

    const fastPath = buildDeterministicAgencyFastPathSummary(cognitionResult, [
      {
        subtaskId: "task-1",
        agentId: "mcp-fetcher",
        result: okResult("ok"),
      },
      {
        subtaskId: "task-2",
        agentId: "general",
        result: okResult("ok"),
      },
    ]);

    expect(fastPath).toBeNull();
  });

  it("detects skippable synthesis subtask when deterministic dependency already completed", () => {
    const shouldSkip = shouldSkipSynthesisSubtaskForDeterministicRoute(
      {
        id: "task-2",
        agentId: "general",
        description: "Summarize the usage output for the marketer.",
        input: {},
        dependencies: ["task-1"],
        priority: "medium",
      },
      [
        {
          subtaskId: "task-1",
          agentId: "mcp-fetcher",
          result: okResult("usage payload", 1600),
        },
      ]
    );

    expect(shouldSkip.skip).toBe(true);
    expect(shouldSkip.sourceSubtaskId).toBe("task-1");
    expect(shouldSkip.sourceAgentId).toBe("mcp-fetcher");
  });

  it("does not skip non-synthesis or missing dependency success", () => {
    const noSkip = shouldSkipSynthesisSubtaskForDeterministicRoute(
      {
        id: "task-2",
        agentId: "general",
        description: "Call external CRM and mutate records.",
        input: {},
        dependencies: ["task-1"],
        priority: "high",
      },
      [
        {
          subtaskId: "task-1",
          agentId: "mcp-fetcher",
          result: okResult("usage payload", 1600),
        },
      ]
    );
    expect(noSkip.skip).toBe(false);

    const failedDep = shouldSkipSynthesisSubtaskForDeterministicRoute(
      {
        id: "task-2",
        agentId: "general",
        description: "Summarize usage output.",
        input: {},
        dependencies: ["task-1"],
        priority: "medium",
      },
      [
        {
          subtaskId: "task-1",
          agentId: "mcp-fetcher",
          result: {
            success: false,
            output: "error",
            modelUsed: "test",
            durationMs: 100,
          },
        },
      ]
    );
    expect(failedDep.skip).toBe(false);
  });
});
