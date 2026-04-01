import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  loadAgentPromptSpec,
  resolveAgentPromptSpec,
  resolveBrandOverridePromptFile,
} from "../../src/tools/agent-spec-loader.js";

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

  it("interpolates placeholders in fallback prompt", () => {
    const prompt = loadAgentPromptSpec(
      "test-agent",
      "knowledge/agents/grounding/missing-prompt.md",
      "Agent: {{AGENT_NAME}}",
      { AGENT_NAME: "Interface" }
    );

    expect(prompt).toBe("Agent: Interface");
  });

  it("still resolves knowledge prompts when cwd is outside the project root", () => {
    const originalCwd = process.cwd();
    const isolatedCwd = mkdtempSync(resolve(tmpdir(), "agent-spec-loader-"));
    const triggerBuildDir = resolve(isolatedCwd, ".trigger", "build");
    mkdirSync(triggerBuildDir, { recursive: true });

    try {
      process.chdir(triggerBuildDir);
      const prompt = loadAgentPromptSpec(
        "grounding",
        "knowledge/agents/grounding/system-prompt.md",
        "fallback"
      );
      expect(prompt).toContain("You are the Grounding Agent");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("maps generic prompt files to brand override paths", () => {
    expect(
      resolveBrandOverridePromptFile(
        "knowledge/agents/grounding/system-prompt.md",
        "northline-fashion"
      )
    ).toBe("knowledge/brands/northline-fashion/agents/grounding/system-prompt.md");

    expect(
      resolveBrandOverridePromptFile(
        "knowledge/sub-agents/mcp-fetcher/system-prompt.md",
        "northline-fashion"
      )
    ).toBe(
      "knowledge/brands/northline-fashion/sub-agents/mcp-fetcher/system-prompt.md"
    );
  });

  it("prefers a brand-specific prompt override when one exists", () => {
    const resolved = resolveAgentPromptSpec(
      "grounding",
      "knowledge/agents/grounding/system-prompt.md",
      "fallback",
      {},
      { brandId: "northline-fashion" }
    );

    expect(resolved.source).toBe(
      "knowledge/brands/northline-fashion/agents/grounding/system-prompt.md"
    );
    expect(resolved.content).toContain("Northline Fashion");
    expect(resolved.content).not.toBe("fallback");
  });
});
