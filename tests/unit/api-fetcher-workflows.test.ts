import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFetcherAgent, __resetRuntimeMappTokenCache } from "../../src/trigger/sub-agents/plugins/api-fetcher.js";
import { learnedRoutesStore } from "../../src/routing/learned-routes-store.js";
import { buildExecutionContext } from "../../src/core/context.js";
import type { LearnedRoute } from "../../src/routing/learned-routes-schema.js";

function makeApiRoute(overrides: Partial<LearnedRoute>): LearnedRoute {
  return {
    id: "route-999",
    capability: "test-api-route",
    description: "Test API route",
    matchPatterns: ["test api route"],
    routeType: "api",
    endpoint: {
      url: "https://api.example.com/v1/query",
      method: "POST",
      headers: {
        Authorization: "Bearer {{MAPP_ANALYTICS_API_TOKEN}}",
        "Content-Type": "application/json",
      },
      queryParams: {},
    },
    apiWorkflow: {
      workflowType: "single-request",
      requestBodySource: "ref/intelligence-channel-performance.json",
      poll: { intervalMs: 1, maxAttempts: 2 },
      resultSelection: "all-success",
    },
    agentInputDefaults: {},
    inputMapping: {},
    outputFormat: "json",
    addedAt: "2026-03-10T00:00:00.000Z",
    addedBy: "test",
    usageCount: 0,
    lastUsedAt: null,
    ...overrides,
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api-fetcher workflows", () => {
  const context = buildExecutionContext("api-fetcher-workflow-test");
  const originalEnv = {
    MAPP_ANALYTICS_API_URL: process.env.MAPP_ANALYTICS_API_URL,
    MAPP_ANALYTICS_API_TOKEN: process.env.MAPP_ANALYTICS_API_TOKEN,
    MAPP_ANALYTICS_API_CLIENT_ID: process.env.MAPP_ANALYTICS_API_CLIENT_ID,
    MAPP_ANALYTICS_API_CLIENT_SECRET: process.env.MAPP_ANALYTICS_API_CLIENT_SECRET,
  };

  beforeEach(() => {
    process.env.MAPP_ANALYTICS_API_URL = "https://intelligence.eu.mapp.com";
    process.env.MAPP_ANALYTICS_API_TOKEN = "seed-token";
    process.env.MAPP_ANALYTICS_API_CLIENT_ID = "client-id";
    process.env.MAPP_ANALYTICS_API_CLIENT_SECRET = "client-secret";
    __resetRuntimeMappTokenCache();
  });

  afterEach(() => {
    process.env.MAPP_ANALYTICS_API_URL = originalEnv.MAPP_ANALYTICS_API_URL;
    process.env.MAPP_ANALYTICS_API_TOKEN = originalEnv.MAPP_ANALYTICS_API_TOKEN;
    process.env.MAPP_ANALYTICS_API_CLIENT_ID = originalEnv.MAPP_ANALYTICS_API_CLIENT_ID;
    process.env.MAPP_ANALYTICS_API_CLIENT_SECRET = originalEnv.MAPP_ANALYTICS_API_CLIENT_SECRET;
    vi.restoreAllMocks();
    __resetRuntimeMappTokenCache();
  });

  it("executes analysis-query workflow with direct calculationId", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "analysis-query",
        requestBodySource: "ref/intelligence-channel-performance.json",
        poll: { intervalMs: 1, maxAttempts: 2 },
        resultSelection: "first-success",
      },
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/analysis-query",
        method: "POST",
        headers: {
          Authorization: "Bearer {{MAPP_ANALYTICS_API_TOKEN}}",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        queryParams: {},
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);
    vi.spyOn(learnedRoutesStore, "incrementUsage").mockImplementation(() => {});

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (url.endsWith("/analytics/api/analysis-query")) {
          return jsonResponse(200, { calculationId: "calc-1" });
        }
        if (url.endsWith("/analytics/api/analysis-result/calc-1")) {
          return jsonResponse(200, {
            rowCount: 2,
            rowCountTotal: 10,
            columnCount: 2,
            headers: [{ name: "metric_a" }, { name: "metric_b" }],
            rows: [
              ["x", 12],
              ["y", 7],
            ],
          });
        }
        return jsonResponse(404, { error: "unexpected-url", url });
      }
    );

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(true);
    expect(output.workflowType).toBe("analysis-query");
    expect(output.preflight.applied).toBe(true);
    expect(output.data.result.rowCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("executes analysis-query workflow with polling before result retrieval", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "analysis-query",
        requestBodySource: "ref/intelligence-channel-performance.json",
        poll: { intervalMs: 1, maxAttempts: 3 },
        resultSelection: "first-success",
      },
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/analysis-query",
        method: "POST",
        headers: {
          Authorization: "Bearer {{MAPP_ANALYTICS_API_TOKEN}}",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        queryParams: {},
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);
    vi.spyOn(learnedRoutesStore, "incrementUsage").mockImplementation(() => {});

    let statusCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (url.endsWith("/analytics/api/analysis-query")) {
          return jsonResponse(200, { correlationId: "corr-1" });
        }
        if (url.endsWith("/analytics/api/analysis-query/corr-1")) {
          statusCalls += 1;
          if (statusCalls === 1) {
            return jsonResponse(200, { status: "RUNNING" });
          }
          return jsonResponse(200, {
            status: "SUCCESS",
            calculationId: "calc-polled",
          });
        }
        if (url.endsWith("/analytics/api/analysis-result/calc-polled")) {
          return jsonResponse(200, {
            rowCount: 1,
            rowCountTotal: 20,
            columnCount: 2,
            headers: [{ name: "metric_a" }, { name: "metric_b" }],
            rows: [["z", 42]],
          });
        }
        return jsonResponse(404, { error: "unexpected-url", url });
      }
    );

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(true);
    expect(output.workflowType).toBe("analysis-query");
    expect(output.data.polling.attempts).toBe(2);
    expect(output.data.result.rowCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns deterministic polling failure when analysis-query never yields calculationId", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "analysis-query",
        requestBodySource: "ref/intelligence-channel-performance.json",
        poll: { intervalMs: 1, maxAttempts: 2 },
        resultSelection: "first-success",
      },
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/analysis-query",
        method: "POST",
        headers: {
          Authorization: "Bearer {{MAPP_ANALYTICS_API_TOKEN}}",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        queryParams: {},
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);
    vi.spyOn(learnedRoutesStore, "incrementUsage").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/analytics/api/analysis-query")) {
        return jsonResponse(200, { correlationId: "corr-timeout" });
      }
      if (url.endsWith("/analytics/api/analysis-query/corr-timeout")) {
        return jsonResponse(200, { status: "RUNNING" });
      }
      return jsonResponse(404, { error: "unexpected-url", url });
    });

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(false);
    expect(output.workflowType).toBe("analysis-query");
    expect(output.data.stage).toBe("poll");
    expect(output.data.polling.attempts).toBe(2);
    expect(String(output.data.error)).toContain("Unable to obtain calculationId");
  });

  it("executes report-query workflow and aggregates multiple results", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "report-query",
        requestBodySource: "ref/intelligence-daily-report.json",
        poll: { intervalMs: 1, maxAttempts: 2 },
        resultSelection: "all-success",
      },
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/report-query",
        method: "POST",
        headers: {
          Authorization: "Bearer {{MAPP_ANALYTICS_API_TOKEN}}",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        queryParams: {},
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);
    vi.spyOn(learnedRoutesStore, "incrementUsage").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/analytics/api/report-query")) {
        return jsonResponse(200, { reportCorrelationId: "report-correlation-id" });
      }
      if (url.endsWith("/analytics/api/report-query/report-correlation-id")) {
        return jsonResponse(200, {
          status: "DONE",
          queryStates: [
            { status: "SUCCESS", calculationId: "calc-a" },
            { status: "SUCCESS", calculationId: "calc-b" },
          ],
        });
      }
      if (url.endsWith("/analytics/api/analysis-result/calc-a")) {
        return jsonResponse(200, {
          rowCount: 1,
          columnCount: 2,
          headers: [{ name: "a" }, { name: "b" }],
          rows: [["kpi", 3]],
        });
      }
      if (url.endsWith("/analytics/api/analysis-result/calc-b")) {
        return jsonResponse(200, {
          rowCount: 2,
          columnCount: 2,
          headers: [{ name: "a" }, { name: "b" }],
          rows: [
            ["kpi", 4],
            ["kpi2", 5],
          ],
        });
      }
      return jsonResponse(404, { error: "unexpected-url", url });
    });

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(true);
    expect(output.workflowType).toBe("report-query");
    expect(output.data.report.selectedCalculationCount).toBe(2);
    expect(output.data.report.totalRows).toBe(3);
    expect(output.data.calculations).toHaveLength(2);
  });

  it("returns deterministic error for malformed requestBodySource", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "analysis-query",
        requestBodySource: "ref/not-existing-template.json",
        poll: { intervalMs: 1, maxAttempts: 2 },
        resultSelection: "first-success",
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { shouldNotBeCalled: true })
    );

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(false);
    expect(String(output.error)).toContain("requestBodySource file not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes token on 401 and retries once", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "single-request",
        requestBodySource: "ref/intelligence-channel-performance.json",
        poll: { intervalMs: 1, maxAttempts: 2 },
        resultSelection: "first-success",
      },
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/query-objects",
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        queryParams: {},
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);
    vi.spyOn(learnedRoutesStore, "incrementUsage").mockImplementation(() => {});

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) => {
        const url = String(_input);
        if (url.includes("/analytics/api/oauth/token")) {
          return jsonResponse(200, {
            access_token: "refreshed-token",
            expires_in: 3600,
            token_type: "bearer",
          });
        }

        const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
        if (auth.includes("refreshed-token")) {
          return jsonResponse(200, { ok: true, source: "retry" });
        }
        return jsonResponse(401, { message: "Unauthorized" });
      }
    );

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(true);
    expect(output.data.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns failure when token refresh fails after 401", async () => {
    const route = makeApiRoute({
      apiWorkflow: {
        workflowType: "single-request",
        requestBodySource: "ref/intelligence-channel-performance.json",
        poll: { intervalMs: 1, maxAttempts: 2 },
        resultSelection: "first-success",
      },
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/query-objects",
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        queryParams: {},
      },
    });
    vi.spyOn(learnedRoutesStore, "getById").mockReturnValue(route);
    vi.spyOn(learnedRoutesStore, "incrementUsage").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/api/oauth/token")) {
        return jsonResponse(401, { error: "invalid_client" });
      }
      return jsonResponse(401, { message: "Unauthorized" });
    });

    const agent = new ApiFetcherAgent();
    const result = await agent.execute({ routeId: "route-999", params: {} }, context);
    const output = JSON.parse(String(result.output));

    expect(result.success).toBe(false);
    expect(output.workflowType).toBe("single-request");
    expect(output.preflight.applied).toBe(true);
    expect(output.data.success).toBe(false);
    expect(output.data.statusCode).toBe(401);
  });
});
