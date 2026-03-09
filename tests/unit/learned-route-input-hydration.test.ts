import { describe, it, expect } from "vitest";
import { hydrateRegisteredSubtaskInput } from "../../src/trigger/learned-route-input-hydration.js";
import type { LearnedRoute } from "../../src/routing/learned-routes-schema.js";

function makeRoute(overrides: Partial<LearnedRoute>): LearnedRoute {
  return {
    id: "route-007",
    capability: "mapp-mcp-list-dimensions-metrics",
    description: "List all available dimensions and metrics in Mapp Intelligence",
    matchPatterns: ["dimensions and metrics"],
    routeType: "sub-agent",
    agentId: "mcp-fetcher",
    agentInputDefaults: {
      serverName: "mapp-michel",
      toolName: "list_dimensions_and_metrics",
      routeId: "route-007",
      args: { language: "en" },
    },
    inputMapping: {},
    outputFormat: "json",
    addedAt: "2026-03-09T00:00:00.000Z",
    addedBy: "test",
    usageCount: 0,
    lastUsedAt: null,
    ...overrides,
  };
}

describe("learned route input hydration", () => {
  it("hydrates matching sub-agent with route defaults", () => {
    const route = makeRoute({});
    const hydrated = hydrateRegisteredSubtaskInput(
      {
        agentId: "mcp-fetcher",
        input: { params: { period: "7d" } },
      },
      route
    );

    expect(hydrated.serverName).toBe("mapp-michel");
    expect(hydrated.toolName).toBe("list_dimensions_and_metrics");
    expect(hydrated.routeId).toBe("route-007");
    expect(hydrated.args).toEqual({ language: "en" });
    expect(hydrated.params).toEqual({ period: "7d" });
  });

  it("preserves runtime args over default args", () => {
    const route = makeRoute({});
    const hydrated = hydrateRegisteredSubtaskInput(
      {
        agentId: "mcp-fetcher",
        input: { args: { language: "de", compacted: false } },
      },
      route
    );

    expect(hydrated.args).toEqual({ language: "de", compacted: false });
  });

  it("does not hydrate when route targets another agent", () => {
    const route = makeRoute({ agentId: "cohort-monitor" });
    const input = { params: { metric: "retention" } };
    const hydrated = hydrateRegisteredSubtaskInput(
      {
        agentId: "mcp-fetcher",
        input,
      },
      route
    );

    expect(hydrated).toEqual(input);
  });
});
