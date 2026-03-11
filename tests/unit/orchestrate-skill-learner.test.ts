import { describe, expect, it, vi } from "vitest";
import { queueSkillLearnerInBackground } from "../../src/trigger/orchestrate.js";
import type {
  CognitionResult,
  ExecutionContext,
  SkillSuggestion,
} from "../../src/core/types.js";

function buildContext(): ExecutionContext {
  return {
    sessionId: "test-session",
    brandIdentity: {
      name: "Brand",
      personality: [],
      values: [],
      voice: { tone: "professional", style: "concise", vocabulary: [], neverSay: [] },
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

function buildCognition(): CognitionResult {
  return {
    subtasks: [
      {
        id: "task-1",
        agentId: "mcp-fetcher",
        description: "How many API calculations have I used this month?",
        input: {},
        dependencies: [],
        priority: "high",
      },
    ],
    reasoning: "test",
    plan: "test",
    rejected: false,
  };
}

describe("queueSkillLearnerInBackground", () => {
  it("queues task without blocking", () => {
    const trigger = vi.fn().mockResolvedValue({ id: "run_123" });
    const suggestions: SkillSuggestion[] = [
      {
        capability: "mapp-monthly-analysis-usage",
        description: "Summarize monthly API usage.",
        suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
        triggerPatterns: ["how many api calculations have i used this month"],
        confidence: "high",
      },
    ];

    queueSkillLearnerInBackground(
      {
        sessionId: "test-session",
        cognitionResult: buildCognition(),
        context: buildContext(),
        skillSuggestions: suggestions,
      },
      trigger
    );

    expect(trigger).toHaveBeenCalledOnce();
    expect(trigger).toHaveBeenCalledWith({
      sessionId: "test-session",
      cognitionResult: buildCognition(),
      context: buildContext(),
      skillSuggestions: suggestions,
    });
  });

  it("swallows async trigger errors", async () => {
    const trigger = vi.fn().mockRejectedValue(new Error("boom"));

    expect(() =>
      queueSkillLearnerInBackground(
        {
          sessionId: "test-session",
          cognitionResult: buildCognition(),
          context: buildContext(),
          skillSuggestions: [],
        },
        trigger
      )
    ).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();

    expect(trigger).toHaveBeenCalledOnce();
  });
});
