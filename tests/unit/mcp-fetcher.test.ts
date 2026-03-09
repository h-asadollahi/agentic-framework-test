import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildMcpToolArgs,
  hydrateMcpInputFromLearnedRoute,
  resolveMcpTemplateValue,
  shapeMcpOutputData,
} from "../../src/trigger/sub-agents/plugins/mcp-fetcher.js";
import { learnedRoutesStore } from "../../src/routing/learned-routes-store.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mcp-fetcher mapping helpers", () => {
  it("resolves exact input placeholders to original value types", () => {
    const result = resolveMcpTemplateValue("{{input.limit}}", { limit: 25 });
    expect(result).toBe(25);
  });

  it("resolves nested objects and arrays", () => {
    const result = resolveMcpTemplateValue(
      {
        query: "{{input.query}}",
        filters: [{ key: "segment", value: "{{input.segment}}" }],
      },
      { query: "vip", segment: "high-value" }
    );

    expect(result).toEqual({
      query: "vip",
      filters: [{ key: "segment", value: "high-value" }],
    });
  });

  it("merges defaults with runtime params and lets runtime override", () => {
    const args = buildMcpToolArgs(
      {
        period: "{{input.period}}",
        metric: "revenue",
      },
      {
        period: "30d",
        metric: "sessions",
        channel: "email",
      }
    );

    expect(args).toEqual({
      period: "30d",
      metric: "sessions",
      channel: "email",
    });
  });

  it("compacts list_dimensions_and_metrics output to names only", () => {
    const shaped = shapeMcpOutputData("list_dimensions_and_metrics", {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            dimensions: [{ name: "time_days" }, { name: "browser_name" }],
            metrics: [{ name: "qty_visits" }, { name: "pages_pageImpressions" }],
          }),
        },
      ],
    }) as Record<string, unknown>;

    expect(shaped.compacted).toBe(true);
    expect(shaped.dimensionsCount).toBe(2);
    expect(shaped.metricsCount).toBe(2);
    expect(shaped.dimensions).toEqual(["time_days", "browser_name"]);
    expect(shaped.metrics).toEqual(["qty_visits", "pages_pageImpressions"]);
  });

  it("truncates very large generic outputs", () => {
    const large = { data: "x".repeat(100_000) };
    const shaped = shapeMcpOutputData("run_analysis", large) as Record<
      string,
      unknown
    >;

    expect(shaped.compacted).toBe(true);
    expect(shaped.note).toBeTruthy();
    expect(typeof shaped.preview).toBe("string");
  });

  it("hydrates missing server/tool from learned route defaults by routeId", () => {
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue({
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
    });

    const hydrated = hydrateMcpInputFromLearnedRoute({
      routeId: "route-007",
      params: { period: "7d" },
    }) as Record<string, unknown>;

    expect(hydrated.serverName).toBe("mapp-michel");
    expect(hydrated.toolName).toBe("list_dimensions_and_metrics");
    expect(hydrated.routeId).toBe("route-007");
    expect(hydrated.args).toEqual({ language: "en" });
    expect(hydrated.params).toEqual({ period: "7d" });
  });
});
