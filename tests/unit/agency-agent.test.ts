import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  AgencyAgent,
  AGENCY_SYSTEM_PROMPT_FALLBACK,
} from "../../src/agents/agency-agent.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("AgencyAgent buildSystemPrompt", () => {
  it("uses runtime prompt content from knowledge specs", () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/agency-system-prompt-custom.md"
    );

    const agent = new AgencyAgent(undefined, {
      promptFile: customPromptPath,
    });
    const context = buildExecutionContext("agency-prompt-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain(
      `Custom Agency Prompt Fixture for ${context.brandIdentity.name}`
    );
  });

  it("falls back when runtime prompt file is unavailable", () => {
    const agent = new AgencyAgent(undefined, {
      promptFile: "knowledge/agents/agency/not-found.md",
    });
    const context = buildExecutionContext("agency-fallback-test");

    const prompt = agent.buildSystemPrompt(context);
    expect(prompt).toContain(context.brandIdentity.name);
    expect(prompt).toContain("You are the Agency Agent");
    expect(prompt).not.toContain("{{BRAND_NAME}}");
    expect(prompt).not.toBe(AGENCY_SYSTEM_PROMPT_FALLBACK);
  });
});
