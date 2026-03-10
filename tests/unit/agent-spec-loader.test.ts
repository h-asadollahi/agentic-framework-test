import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadAgentPromptSpec } from "../../src/tools/agent-spec-loader.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("loadAgentPromptSpec", () => {
  it("reads markdown prompt content from disk", () => {
    const prompt = loadAgentPromptSpec(
      "grounding",
      "knowledge/agents/grounding/system-prompt.md",
      "fallback"
    );

    expect(prompt).toContain("You are the Grounding Agent");
    expect(prompt).not.toBe("fallback");
  });

  it("applies simple placeholder interpolation", () => {
    const templatePath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/agent-spec-template.md"
    );

    const prompt = loadAgentPromptSpec("test-agent", templatePath, "fallback", {
      AGENT_NAME: "Cognition",
      SCOPE: "task decomposition",
    });

    expect(prompt).toContain("You are Cognition.");
    expect(prompt).toContain("scope is task decomposition");
  });

  it("returns fallback when prompt file is missing", () => {
    const fallback = "fallback-prompt-value";
    const prompt = loadAgentPromptSpec(
      "grounding",
      "knowledge/agents/grounding/missing-prompt.md",
      fallback
    );

    expect(prompt).toBe(fallback);
  });
});
