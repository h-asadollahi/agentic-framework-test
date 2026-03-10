import { describe, it, expect } from "vitest";
import {
  buildMcpBuilderAgentResult,
  buildMcpBuilderGuidance,
  isMcpBuilderIntent,
} from "../../src/trigger/mcp-builder.js";
import type { ExecutionContext } from "../../src/core/types.js";

function makeContext(): ExecutionContext {
  return {
    sessionId: "test-session",
    brandIdentity: {
      name: "Brand",
      personality: [],
      values: [],
      voice: {
        tone: "professional",
        style: "concise",
        vocabulary: [],
        neverSay: [],
      },
      targetAudience: "",
      guidelines: "",
    },
    guardrails: {
      neverDo: [],
      alwaysDo: [],
      brandVoiceRules: [],
      contentPolicies: [],
    },
    shortTermMemory: {
      sessionId: "test-session",
      conversationHistory: [],
      activeContext: {},
    },
    longTermMemory: {
      synthesizedLearnings: [],
      pastDecisions: [],
      brandContextCache: {},
    },
  };
}

describe("mcp-builder routing helpers", () => {
  it("detects API-to-MCP builder intent", () => {
    const match = isMcpBuilderIntent({
      description: "Create MCP server for this CRM API integration",
      input: {},
    });
    expect(match).toBe(true);
  });

  it("does not match regular analytics prompts", () => {
    const match = isMcpBuilderIntent({
      description: "Show me my page impressions for the last 7 days",
      input: {},
    });
    expect(match).toBe(false);
  });

  it("builds structured MCP builder guidance", () => {
    const guidance = buildMcpBuilderGuidance(
      {
        description: "Build an MCP server for our internal product API",
        input: {},
      },
      makeContext(),
      "### Phase 1: Deep Research and Planning\n### Phase 2: Implementation\n"
    );

    expect(guidance.workflow).toBe("mcp-builder");
    expect(Array.isArray(guidance.implementationPhases)).toBe(true);
    expect(Array.isArray(guidance.nextSteps)).toBe(true);
  });

  it("returns a successful agency-compatible result", () => {
    const result = buildMcpBuilderAgentResult(
      {
        description: "Create MCP server for API call workflow",
        input: {},
      },
      makeContext()
    );
    expect(result.success).toBe(true);
    expect(result.modelUsed).toBe("mcp-builder-skill");
  });
});
