import { describe, expect, it } from "vitest";
import { buildExecutionContext } from "../../src/core/context.js";
import { buildJudgementPacket, shouldSkipCognitionForStrongDeterministicRoute } from "../../src/trigger/judgement-packet.js";
import { preloadCognitionStores } from "../../src/trigger/think.js";

describe("judgement packet", () => {
  it("builds compact route and skill candidate context", async () => {
    await preloadCognitionStores();
    const context = await buildExecutionContext("judgement-packet-test");
    const packet = buildJudgementPacket(
      "List all available dimensions and metrics in Mapp Intelligence",
      context
    );

    expect(packet.brandContractSummary).toContain(context.brandIdentity.name);
    expect(packet.classification).toMatch(/deterministic|analytics|general/);
    expect(packet.routeCandidates.length).toBeLessThanOrEqual(3);
    expect(packet.skillCandidates.length).toBeLessThanOrEqual(3);
    expect(packet.subAgentCandidates.length).toBeLessThanOrEqual(3);
    expect(packet.routeInventoryHash).toHaveLength(40);
    expect(packet.skillInventoryHash).toHaveLength(40);
  });

  it("allows strong deterministic route requests to skip cognition", async () => {
    const context = await buildExecutionContext("judgement-packet-skip-test");
    const packet = {
      ...buildJudgementPacket("Show me page impressions", context),
      routeCandidates: [
        {
          id: "route-010",
          capability: "page impressions",
          description: "Retrieve page impressions",
          routeType: "sub-agent" as const,
          agentId: "mcp-fetcher",
          workflowType: undefined,
          matchPatterns: ["show me my page impressions", "page impressions"],
          score: 34,
          matchedPatternCount: 2,
        },
      ],
    };

    expect(shouldSkipCognitionForStrongDeterministicRoute(packet)).toBe(true);
  });
});
