import { describe, it, expect } from "vitest";
import { resolveExecutionAgentId } from "../../src/trigger/route-target-resolution.js";
import type { LearnedRoute } from "../../src/routing/learned-routes-schema.js";

function makeSubAgentRoute(
  id: string,
  agentId: string
): LearnedRoute {
  return {
    id,
    capability: "test-sub-agent-route",
    description: "Sub-agent route",
    matchPatterns: ["sub-agent route"],
    routeType: "sub-agent",
    agentId,
    agentInputDefaults: {},
    inputMapping: {},
    outputFormat: "json",
    addedAt: "2026-03-10T00:00:00.000Z",
    addedBy: "test",
    usageCount: 0,
    lastUsedAt: null,
  };
}

function makeApiRoute(id: string): LearnedRoute {
  return {
    id,
    capability: "test-api-route",
    description: "API route",
    matchPatterns: ["api route"],
    routeType: "api",
    endpoint: {
      method: "GET",
      url: "https://example.test/api",
      headers: {},
      queryParams: {},
    },
    inputMapping: {},
    outputFormat: "json",
    addedAt: "2026-03-10T00:00:00.000Z",
    addedBy: "test",
    usageCount: 0,
    lastUsedAt: null,
  };
}

describe("route target resolution", () => {
  it("overrides conflicting registered agent to learned sub-agent target", () => {
    const route = makeSubAgentRoute("route-006", "mcp-fetcher");
    const result = resolveExecutionAgentId(
      "api-fetcher",
      route,
      (agentId) => ["api-fetcher", "mcp-fetcher"].includes(agentId)
    );

    expect(result.executionAgentId).toBe("mcp-fetcher");
    expect(result.overridden).toBe(true);
  });

  it("keeps agent when already matching learned sub-agent target", () => {
    const route = makeSubAgentRoute("route-006", "mcp-fetcher");
    const result = resolveExecutionAgentId(
      "mcp-fetcher",
      route,
      (agentId) => ["api-fetcher", "mcp-fetcher"].includes(agentId)
    );

    expect(result.executionAgentId).toBe("mcp-fetcher");
    expect(result.overridden).toBe(false);
  });

  it("maps api learned route to api-fetcher when needed", () => {
    const route = makeApiRoute("route-101");
    const result = resolveExecutionAgentId(
      "mcp-fetcher",
      route,
      (agentId) => ["api-fetcher", "mcp-fetcher"].includes(agentId)
    );

    expect(result.executionAgentId).toBe("api-fetcher");
    expect(result.overridden).toBe(true);
  });

  it("does not override when learned sub-agent target is not registered", () => {
    const route = makeSubAgentRoute("route-006", "custom-unregistered-agent");
    const result = resolveExecutionAgentId(
      "api-fetcher",
      route,
      (agentId) => ["api-fetcher", "mcp-fetcher"].includes(agentId)
    );

    expect(result.executionAgentId).toBe("api-fetcher");
    expect(result.overridden).toBe(false);
  });

  it("does not override when no learned route exists", () => {
    const result = resolveExecutionAgentId(
      "api-fetcher",
      null,
      (agentId) => ["api-fetcher", "mcp-fetcher"].includes(agentId)
    );

    expect(result.executionAgentId).toBe("api-fetcher");
    expect(result.overridden).toBe(false);
  });
});
