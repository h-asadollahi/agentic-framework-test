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

  it("filters deterministic fast-path boilerplate from findings", () => {
    const result = buildDeterministicDeliveryFastPath(makeAgency(), [
      "Deterministic fast path: Analyze engagement and summarize.",
    ]);

    expect(result.formattedResponse).not.toContain("Deterministic fast path:");
  });
});
