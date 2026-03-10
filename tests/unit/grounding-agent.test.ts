import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  GroundingAgent,
  GROUNDING_SYSTEM_PROMPT_FALLBACK,
} from "../../src/agents/grounding-agent.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("GroundingAgent buildSystemPrompt", () => {
  it("uses runtime prompt content from knowledge specs", () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/grounding-system-prompt-custom.md"
    );

    const agent = new GroundingAgent(undefined, {
      promptFile: customPromptPath,
    });
    const context = buildExecutionContext("grounding-prompt-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain("Custom Grounding Prompt Fixture");
  });

  it("falls back when runtime prompt file is unavailable", () => {
    const agent = new GroundingAgent(undefined, {
      promptFile: "knowledge/agents/grounding/not-found.md",
    });
    const context = buildExecutionContext("grounding-fallback-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toBe(GROUNDING_SYSTEM_PROMPT_FALLBACK);
    expect(prompt).toContain("You are the Grounding Agent");
  });
});
