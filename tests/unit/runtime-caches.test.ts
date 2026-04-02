import { describe, expect, it } from "vitest";
import {
  buildDeterministicResultCacheKey,
  buildPlanCacheKey,
  buildRenderCacheKey,
  clearOptimizationCaches,
  getCachedDeterministicResult,
  getCachedPlan,
  getCachedRender,
  setCachedDeterministicResult,
  setCachedPlan,
  setCachedRender,
} from "../../src/optimization/runtime-caches.js";

describe("runtime optimization caches", () => {
  it("stores and retrieves plan cache entries by brand-aware key", () => {
    clearOptimizationCaches();
    const key = buildPlanCacheKey({
      userMessage: "list dimensions and metrics",
      brandContractHash: "brand-hash",
      routeInventoryHash: "route-hash",
      skillInventoryHash: "skill-hash",
      audience: "marketer",
      scope: "brand",
    });

    setCachedPlan(key, {
      subtasks: [],
      reasoning: "cached",
      plan: "cached",
      rejected: false,
    });

    expect(getCachedPlan(key)?.plan).toBe("cached");
  });

  it("stores and retrieves deterministic execution results", () => {
    clearOptimizationCaches();
    const key = buildDeterministicResultCacheKey({
      agentId: "mcp-fetcher",
      routeId: "route-002",
      normalizedInput: { routeId: "route-002" },
      brandContractHash: "brand-hash",
    });

    setCachedDeterministicResult(key, {
      success: true,
      output: "cached-result",
      modelUsed: "mcp-fetcher",
    });

    expect(getCachedDeterministicResult(key)?.output).toBe("cached-result");
  });

  it("stores and retrieves deterministic render outputs", () => {
    clearOptimizationCaches();
    const key = buildRenderCacheKey({
      brandContractHash: "brand-hash",
      agencySummary: "summary",
      issues: [],
      results: [],
    });

    setCachedRender(key, {
      formattedResponse: "cached-render",
      notifications: [],
    });

    expect(getCachedRender(key)?.formattedResponse).toBe("cached-render");
  });
});
