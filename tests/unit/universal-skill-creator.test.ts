import { afterEach, describe, it, expect } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildUniversalSkillCreatorAgentResult,
  buildUniversalSkillGuidance,
  isUniversalSkillCreationIntent,
} from "../../src/trigger/universal-skill-creator.js";
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

const generatedSkillFiles = [
  resolve(process.cwd(), "skills/build-new-agent-skill-for-campaign-qa.md"),
  resolve(process.cwd(), "skills/create-reusable-skill-for-email-qa.md"),
];

afterEach(() => {
  for (const filePath of generatedSkillFiles) {
    if (existsSync(filePath)) unlinkSync(filePath);
  }
});

describe("universal skill creator helpers", () => {
  it("detects skill-creation intent", () => {
    expect(
      isUniversalSkillCreationIntent({
        description: "Create skill for support ticket triage",
        input: {},
      })
    ).toBe(true);
  });

  it("does not detect normal analytics prompt as skill creation", () => {
    expect(
      isUniversalSkillCreationIntent({
        description: "Show me my page impressions for the last 7 days",
        input: {},
      })
    ).toBe(false);
  });

  it("builds guidance that points to ./skills folder", () => {
    const guidance = buildUniversalSkillGuidance(
      {
        description: "Build new agent skill for campaign QA",
        input: {},
      },
      makeContext(),
      "## Phase 1\n## Phase 2\n"
    );

    expect(guidance.workflow).toBe("universal-agent-skill-creator");
    expect(guidance.destinationFolder).toBe("skills");
    expect(String(guidance.suggestedSkillFile)).toContain("skills/");
  });

  it("returns agency-compatible result", () => {
    const result = buildUniversalSkillCreatorAgentResult(
      {
        description: "Create reusable skill for email QA",
        input: {},
      },
      makeContext()
    );

    expect(result.success).toBe(true);
    expect(result.modelUsed).toBe("universal-skill-creator");
  });
});
