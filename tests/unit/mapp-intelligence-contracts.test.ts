import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const projectRoot = resolve(process.cwd());
const postmanCollectionFile = resolve(
  projectRoot,
  "ref/intelligence-postman-collection.json"
);
const learnedRoutesFile = resolve(projectRoot, "knowledge/learned-routes.json");

function parseJsonFile(filePath: string): JsonRecord {
  return JSON.parse(readFileSync(filePath, "utf-8")) as JsonRecord;
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function collectRequestUrls(items: unknown[]): string[] {
  const urls: string[] = [];

  for (const item of items) {
    const record = asRecord(item);
    const request = asRecord(record.request);
    const requestUrl = asRecord(request.url).raw;
    if (typeof requestUrl === "string") {
      urls.push(requestUrl);
    }

    const nested = record.item;
    if (Array.isArray(nested)) {
      urls.push(...collectRequestUrls(nested));
    }
  }

  return urls;
}

describe("mapp intelligence route/template contracts", () => {
  it("postman collection contains required workflow endpoints", () => {
    expect(existsSync(postmanCollectionFile)).toBe(true);

    const collection = parseJsonFile(postmanCollectionFile);
    const items = Array.isArray(collection.item) ? collection.item : [];
    const urls = collectRequestUrls(items);
    const combined = urls.join("\n");

    expect(combined).toContain("/analytics/api/oauth/token");
    expect(combined).toContain("/analytics/api/analysis-query");
    expect(combined).toContain("/analytics/api/analysis-result/");
    expect(combined).toContain("/analytics/api/report-query");
  });

  it("all learned api requestBodySource templates exist and parse as JSON", () => {
    expect(existsSync(learnedRoutesFile)).toBe(true);

    const learned = parseJsonFile(learnedRoutesFile);
    const routes = Array.isArray(learned.routes) ? learned.routes : [];

    const apiRoutesWithSource = routes.filter((route) => {
      const record = asRecord(route);
      const apiWorkflow = asRecord(record.apiWorkflow);
      return (
        record.routeType === "api" &&
        typeof apiWorkflow.requestBodySource === "string" &&
        apiWorkflow.requestBodySource.length > 0
      );
    });

    expect(apiRoutesWithSource.length).toBeGreaterThan(0);

    for (const route of apiRoutesWithSource) {
      const routeRecord = asRecord(route);
      const source = String(asRecord(routeRecord.apiWorkflow).requestBodySource);
      const absoluteSource = resolve(projectRoot, source);

      expect(existsSync(absoluteSource)).toBe(true);
      const template = parseJsonFile(absoluteSource);
      expect(typeof template).toBe("object");
      expect(Array.isArray(template)).toBe(false);
    }
  });

  it("maps report-template capabilities to expected api workflow routes", () => {
    const learned = parseJsonFile(learnedRoutesFile);
    const routes = Array.isArray(learned.routes) ? learned.routes : [];

    const byCapability = new Map<string, JsonRecord>();
    for (const route of routes) {
      const record = asRecord(route);
      if (typeof record.capability === "string") {
        byCapability.set(record.capability, record);
      }
    }

    const contracts = [
      {
        capability: "mapp-intelligence-cohort-performance-report",
        workflowType: "report-query",
        endpointSuffix: "/analytics/api/report-query",
        requestBodySource: "ref/intelligence-cohort-performance.json",
      },
      {
        capability: "mapp-intelligence-channel-performance-analysis",
        workflowType: "analysis-query",
        endpointSuffix: "/analytics/api/analysis-query",
        requestBodySource: "ref/intelligence-channel-performance.json",
      },
      {
        capability: "mapp-intelligence-daily-report-global",
        workflowType: "report-query",
        endpointSuffix: "/analytics/api/report-query",
        requestBodySource: "ref/intelligence-daily-report.json",
      },
    ];

    for (const contract of contracts) {
      const route = byCapability.get(contract.capability);
      expect(route).toBeDefined();

      const endpoint = asRecord(route?.endpoint);
      const apiWorkflow = asRecord(route?.apiWorkflow);

      expect(route?.routeType).toBe("api");
      expect(String(endpoint.url)).toContain(contract.endpointSuffix);
      expect(apiWorkflow.workflowType).toBe(contract.workflowType);
      expect(apiWorkflow.requestBodySource).toBe(contract.requestBodySource);
    }
  });
});
