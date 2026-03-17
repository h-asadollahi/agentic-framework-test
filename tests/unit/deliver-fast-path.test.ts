import { describe, expect, it } from "vitest";
import type { AgencyResult } from "../../src/core/types.js";
import {
  buildDeterministicDeliveryFastPath,
  shouldUseDeterministicDeliverFastPath,
} from "../../src/trigger/deliver.js";

function makeAgency(overrides?: Partial<AgencyResult>): AgencyResult {
  return {
    results: [
      {
        subtaskId: "task-1",
        agentId: "mcp-fetcher",
        result: {
          success: true,
          output:
            "Monthly usage loaded. calculationsCount=49, maxCalculationsAllowed=9300.",
          modelUsed: "mcp-fetcher (no model)",
          durationMs: 1200,
        },
      },
    ],
    summary: "Mapp monthly API usage was retrieved successfully with low current usage.",
    issues: [],
    needsHumanReview: false,
    ...overrides,
  };
}

function makeCatalogAgency(): AgencyResult {
  return makeAgency({
    results: [
      {
        subtaskId: "task-1",
        agentId: "mcp-fetcher",
        result: {
          success: true,
          output: JSON.stringify({
            serverName: "mapp-michel",
            toolName: "list_dimensions_and_metrics",
            data: {
              dimensionsCount: 6,
              metricsCount: 6,
              dimensions: [
                "time_day",
                "time_week",
                "browser_name",
                "browser_version",
                "geo_country",
                "geo_region",
              ],
              metrics: [
                "pages_pageImpressions",
                "pages_entryRate",
                "visits_total",
                "visits_bounceRate",
                "revenue_total",
                "revenue_averageOrderValue",
              ],
            },
            executedAt: "2026-03-16T12:00:00.000Z",
          }),
          modelUsed: "mcp-fetcher (no model)",
          durationMs: 1200,
        },
      },
    ],
    summary:
      "Deterministic fast path: List all available dimensions and metrics in Mapp Intelligence completed via mcp-fetcher in 1200ms (subtask time).",
  });
}

describe("deliver deterministic fast path", () => {
  it("activates for safe single deterministic-route outputs", () => {
    expect(shouldUseDeterministicDeliverFastPath(makeAgency())).toBe(true);
  });

  it("does not activate when human review is required", () => {
    expect(
      shouldUseDeterministicDeliverFastPath(
        makeAgency({
          needsHumanReview: true,
        })
      )
    ).toBe(false);
  });

  it("renders human-readable markdown sections", () => {
    const result = buildDeterministicDeliveryFastPath(makeAgency(), [
      "Calculations Used: 49",
      "Maximum Allowed: 9,300",
      "Remaining Capacity: 9,251",
    ]);

    expect(result.formattedResponse).toContain("## Executive Summary");
    expect(result.formattedResponse).toContain("## Key Findings");
    expect(result.formattedResponse).toContain("## Data Source and Time Window");
    expect(result.formattedResponse).toContain("## Recommended Next Step");
    expect(result.formattedResponse).toContain("Calculations Used: 49");
  });

  it("renders grouped catalog details for list_dimensions_and_metrics payloads", () => {
    const result = buildDeterministicDeliveryFastPath(makeCatalogAgency(), []);

    expect(result.formattedResponse).toContain("## Dimension Snapshot");
    expect(result.formattedResponse).toContain("## Metric Snapshot");
    expect(result.formattedResponse).toContain("Total dimensions available: 6");
    expect(result.formattedResponse).toContain("Total metrics available: 6");
    expect(result.formattedResponse).toContain("`browser` (2): `browser_name`, `browser_version`");
    expect(result.formattedResponse).toContain("`pages` (2): `pages_entryRate`, `pages_pageImpressions`");
    expect(result.formattedResponse).toContain("Time Window: Not applicable for catalog metadata requests");
    expect(result.formattedResponse).not.toContain("Results were retrieved successfully.");
  });

  it("filters deterministic fast-path boilerplate from findings", () => {
    const result = buildDeterministicDeliveryFastPath(makeAgency(), [
      "Deterministic fast path: Analyze engagement and summarize.",
    ]);

    expect(result.formattedResponse).not.toContain("Deterministic fast path:");
  });
});
