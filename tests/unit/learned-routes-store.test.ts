import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { learnedRoutesStore } from "../../src/routing/learned-routes-store.js";

const routesFile = resolve(process.cwd(), "knowledge/learned-routes.json");
const initialRoutesFile = JSON.stringify(
  {
    version: "1.0.0",
    lastUpdated: "2026-03-06T00:00:00.000Z",
    routes: [],
  },
  null,
  2
) + "\n";

let backupContent: string | null = null;
let backupExisted = false;

describe.sequential("learned-routes store", () => {
  beforeAll(() => {
    backupExisted = existsSync(routesFile);
    backupContent = backupExisted ? readFileSync(routesFile, "utf-8") : null;
  });

  beforeEach(() => {
    writeFileSync(routesFile, initialRoutesFile, "utf-8");
    learnedRoutesStore.load();
  });

  afterAll(() => {
    if (backupExisted && backupContent !== null) {
      writeFileSync(routesFile, backupContent, "utf-8");
      return;
    }

    writeFileSync(routesFile, initialRoutesFile, "utf-8");
  });

  it("adds and retrieves a route", () => {
    const added = learnedRoutesStore.addRoute({
      capability: "clv-analysis",
      description: "Fetch CLV for current quarter",
      matchPatterns: ["clv", "customer lifetime value"],
      endpoint: {
        url: "https://api.example.com/v1/clv",
        method: "GET",
        headers: { Authorization: "Bearer {{CLV_API_KEY}}" },
        queryParams: { range: "{{input.range}}" },
      },
      addedBy: "tester",
    });

    expect(added.id).toBe("route-001");
    expect(learnedRoutesStore.count()).toBe(1);
    expect(learnedRoutesStore.getById("route-001")?.endpoint.url).toBe(
      "https://api.example.com/v1/clv"
    );
  });

  it("matches route by description patterns", () => {
    learnedRoutesStore.addRoute({
      capability: "retention-analysis",
      description: "Retention API route",
      matchPatterns: ["retention", "cohort retention"],
      endpoint: {
        url: "https://api.example.com/v1/retention",
        method: "GET",
        headers: {},
        queryParams: {},
      },
      addedBy: "tester",
    });

    const match = learnedRoutesStore.findByCapability(
      "Please fetch cohort retention by week"
    );
    expect(match?.id).toBe("route-001");
  });

  it("increments usage and summary ordering", () => {
    learnedRoutesStore.addRoute({
      capability: "one",
      description: "Route one",
      matchPatterns: ["one"],
      endpoint: { url: "https://api.example.com/one", method: "GET", headers: {}, queryParams: {} },
      addedBy: "tester",
    });

    learnedRoutesStore.addRoute({
      capability: "two",
      description: "Route two",
      matchPatterns: ["two"],
      endpoint: { url: "https://api.example.com/two", method: "GET", headers: {}, queryParams: {} },
      addedBy: "tester",
    });

    learnedRoutesStore.incrementUsage("route-002");
    learnedRoutesStore.incrementUsage("route-002");
    learnedRoutesStore.incrementUsage("route-001");

    const summary = learnedRoutesStore.getSummary();
    expect(summary[0].id).toBe("route-002");
    expect(summary[1].id).toBe("route-001");
  });

  it("supports sub-agent learned routes", () => {
    const added = learnedRoutesStore.addRoute({
      capability: "vip-cohort-performance",
      description: "How is our VIP cohort performing this quarter?",
      matchPatterns: ["vip cohort", "cohort performing", "quarter"],
      routeType: "sub-agent",
      agentId: "cohort-monitor",
      agentInputDefaults: {
        cohortId: "vip",
        metric: "engagement",
        timeRange: "90d",
        compareBaseline: true,
      },
      addedBy: "tester",
    });

    expect(added.routeType).toBe("sub-agent");
    expect(added.agentId).toBe("cohort-monitor");
    expect(added.endpoint).toBeUndefined();
  });

  it("prefers mcp-fetcher when api and mcp routes tie on match score", () => {
    learnedRoutesStore.addRoute({
      capability: "segments-via-api",
      description: "Segments via API route",
      matchPatterns: ["segments", "mapp intelligence account"],
      endpoint: {
        url: "https://api.example.com/v1/segments",
        method: "GET",
        headers: {},
        queryParams: {},
      },
      addedBy: "tester",
    });

    learnedRoutesStore.addRoute({
      capability: "segments-via-mcp",
      description: "Segments via MCP route",
      matchPatterns: ["segments", "mapp intelligence account"],
      routeType: "sub-agent",
      agentId: "mcp-fetcher",
      agentInputDefaults: {
        serverName: "mapp-michel",
        toolName: "list_segments",
      },
      addedBy: "tester",
    });

    const match = learnedRoutesStore.findByCapability(
      "What segments are defined in my Mapp Intelligence account?"
    );

    expect(match?.id).toBe("route-002");
    expect(match?.routeType).toBe("sub-agent");
    expect(match?.agentId).toBe("mcp-fetcher");
  });

  it("includes api workflow metadata in summary for template-backed routes", () => {
    learnedRoutesStore.addRoute({
      capability: "daily-report-template",
      description: "Daily report template route",
      matchPatterns: ["daily report", "kpi report"],
      endpoint: {
        url: "https://intelligence.eu.mapp.com/analytics/api/report-query",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        queryParams: {},
      },
      apiWorkflow: {
        workflowType: "report-query",
        requestBodySource: "ref/intelligence-daily-report.json",
        poll: { intervalMs: 2000, maxAttempts: 30 },
        resultSelection: "all-success",
      },
      addedBy: "tester",
    });

    const summary = learnedRoutesStore.getSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0].workflowType).toBe("report-query");
  });
});
