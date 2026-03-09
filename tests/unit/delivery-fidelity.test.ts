import { describe, it, expect } from "vitest";
import {
  buildHumanReadableRenderRequirements,
  enforceCriticalFactsInResponse,
  extractCriticalFacts,
} from "../../src/trigger/delivery-fidelity.js";
import type { AgencyResult, GuardrailConstraints } from "../../src/core/types.js";

function makeAgency(summary: string): AgencyResult {
  return {
    results: [
      {
        subtaskId: "task-1",
        agentId: "mcp-fetcher",
        result: {
          success: true,
          output:
            "Total Page Impressions (last 7 days): 12,438,674\nTop Session: 95 page impressions\nResult retrieved at: 2026-03-09T16:00:29 UTC",
          modelUsed: "mcp-fetcher",
        },
      },
    ],
    summary,
    issues: ["The data is sorted descending by page impressions."],
    needsHumanReview: false,
  };
}

describe("delivery fidelity", () => {
  it("extracts critical facts from summary, result output, and issues", () => {
    const facts = extractCriticalFacts(
      makeAgency(
        "Page impressions analysis complete for 2026-03-02 to 2026-03-09. Total sessions analyzed: 2,189,670."
      )
    );

    expect(facts.some((f) => f.includes("2026-03-02"))).toBe(true);
    expect(facts.some((f) => f.includes("12,438,674"))).toBe(true);
    expect(facts.some((f) => f.startsWith("Issue:"))).toBe(true);
  });

  it("appends missing facts in a readable section", () => {
    const response = "## Executive Summary\nA 7-day analysis is ready.";
    const enriched = enforceCriticalFactsInResponse(response, [
      "Total Page Impressions (last 7 days): 12,438,674",
      "Top Session: 95 page impressions",
    ]);

    expect(enriched).toContain("## Detailed Findings");
    expect(enriched).toContain("12,438,674");
    expect(enriched).toContain("95 page impressions");
  });

  it("builds human-readable requirements from guardrails", () => {
    const guardrails: GuardrailConstraints = {
      neverDo: [],
      alwaysDo: [
        "Always include data sources when citing statistics",
        "Always log reasoning for decisions that affect campaigns",
      ],
      brandVoiceRules: [],
      contentPolicies: [],
    };

    const reqs = buildHumanReadableRenderRequirements(guardrails, {
      subtasks: [],
      reasoning: "Single route match.",
      plan: "Retrieve page impressions then present findings.",
      rejected: false,
      rejectionReason: undefined,
    });

    expect(reqs.some((r) => r.includes("Key Findings"))).toBe(true);
    expect(reqs.some((r) => r.includes("Guardrail: Always include data sources"))).toBe(
      true
    );
    expect(reqs.some((r) => r.includes("Execution Plan Context"))).toBe(true);
  });
});
