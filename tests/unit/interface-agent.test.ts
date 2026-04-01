import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  InterfaceAgent,
  INTERFACE_SYSTEM_PROMPT_FALLBACK,
} from "../../src/agents/interface-agent.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("InterfaceAgent buildSystemPrompt", () => {
  it("uses runtime prompt content from knowledge specs", async () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/interface-system-prompt-custom.md"
    );

    const agent = new InterfaceAgent(undefined, {
      promptFile: customPromptPath,
    });
    const context = await buildExecutionContext("interface-prompt-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain(
      `Custom Interface Prompt Fixture for ${context.brandIdentity.name}`
    );
  });

  it("falls back when runtime prompt file is unavailable", async () => {
    const agent = new InterfaceAgent(undefined, {
      promptFile: "knowledge/agents/interface/not-found.md",
    });
    const context = await buildExecutionContext("interface-fallback-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain(context.brandIdentity.name);
    expect(prompt).toContain("You are the Interface Agent");
    expect(prompt).not.toContain("{{BRAND_NAME}}");
    expect(prompt).not.toBe(INTERFACE_SYSTEM_PROMPT_FALLBACK);
  });
});
