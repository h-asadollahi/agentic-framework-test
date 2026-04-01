import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  CognitionAgent,
  COGNITION_SYSTEM_PROMPT_FALLBACK,
} from "../../src/agents/cognition-agent.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("CognitionAgent buildSystemPrompt", () => {
  it("uses runtime prompt content from knowledge specs", async () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/cognition-system-prompt-custom.md"
    );

    const agent = new CognitionAgent(undefined, {
      promptFile: customPromptPath,
    });
    const context = await buildExecutionContext("cognition-prompt-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain(`Custom Cognition Prompt Fixture for ${context.brandIdentity.name}`);
  });

  it("falls back when runtime prompt file is unavailable", async () => {
    const agent = new CognitionAgent(undefined, {
      promptFile: "knowledge/agents/cognition/not-found.md",
    });
    const context = await buildExecutionContext("cognition-fallback-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain(context.brandIdentity.name);
    expect(prompt).toContain("You are the Cognition Agent");
    expect(prompt).not.toContain("{{BRAND_NAME}}");
    expect(prompt).not.toBe(COGNITION_SYSTEM_PROMPT_FALLBACK);
  });
});
