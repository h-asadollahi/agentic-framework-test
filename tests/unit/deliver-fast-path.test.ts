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

function makeTokenUsageAgency(): AgencyResult {
  return {
    results: [
      {
        subtaskId: "task-1",
        agentId: "token-usage-monitor",
        result: {
          success: true,
          output: JSON.stringify({
            audience: "marketer",
            brandId: "acme-marketing",
            days: 7,
            bucket: "day",
            totalPrompts: 18,
            totalLlmCalls: 123,
            totalInputTokens: 32100,
            totalOutputTokens: 22221,
            totalTokens: 54321,
            totalCalls: 123,
            byProvider: [
              { provider: "openai", tokens: 32000, calls: 70 },
              { provider: "anthropic", tokens: 22321, calls: 53 },
            ],
            byModel: [
              { model: "openai:gpt-5.4-mini", tokens: 25000, calls: 60 },
              { model: "anthropic:claude-sonnet-4", tokens: 22321, calls: 53 },
            ],
            daily: [
              {
                bucket: "2026-03-15",
                promptCount: 6,
                llmCallCount: 41,
                inputTokens: 12000,
                outputTokens: 9000,
                totalTokens: 21000,
                tokens: 21000,
                calls: 41,
              },
              {
                bucket: "2026-03-16",
                promptCount: 5,
                llmCallCount: 39,
                inputTokens: 9800,
                outputTokens: 7200,
                totalTokens: 17000,
                tokens: 17000,
                calls: 39,
              },
              {
                bucket: "2026-03-17",
                promptCount: 7,
                llmCallCount: 43,
                inputTokens: 10300,
                outputTokens: 6021,
                totalTokens: 16321,
                tokens: 16321,
                calls: 43,
              },
            ],
            note: "Telemetry is forward-only from the time LLM usage tracking was enabled.",
          }),
          modelUsed: "telemetry-db",
          durationMs: 45,
        },
      },
    ],
    summary:
      "Deterministic fast path: Aggregate daily LLM token usage for operational reporting completed via token-usage-monitor in 45ms (subtask time).",
    issues: [],
    needsHumanReview: false,
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

  it("renders admin token-usage summaries from the token monitor capability", () => {
    const result = buildDeterministicDeliveryFastPath(makeTokenUsageAgency(), []);

    expect(result.formattedResponse).toContain("Tracked 54,321 total tokens");
    expect(result.formattedResponse).toContain("18 prompts and 123 LLM calls");
    expect(result.formattedResponse).toContain("Brand filter: acme-marketing");
    expect(result.formattedResponse).toContain("Total prompts: 18");
    expect(result.formattedResponse).toContain("Total input tokens: 32,100");
    expect(result.formattedResponse).toContain("## Daily Breakdown");
    expect(result.formattedResponse).toContain(
      "2026-03-17: 16,321 total tokens (10,300 input, 6,021 output) across 7 prompts and 43 LLM calls"
    );
    expect(result.formattedResponse).toContain("`openai`: 32,000 tokens across 70 calls");
    expect(result.formattedResponse).toContain("`openai:gpt-5.4-mini`: 25,000 tokens across 60 calls");
  });
});
