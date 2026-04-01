import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  McpFetcherAgent,
  MCP_FETCHER_SYSTEM_PROMPT_FALLBACK,
} from "../../src/trigger/sub-agents/plugins/mcp-fetcher.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("McpFetcherAgent prompt + execution", () => {
  it("uses runtime prompt content from knowledge specs", async () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/mcp-fetcher-system-prompt-custom.md"
    );
    const agent = new McpFetcherAgent({ promptFile: customPromptPath });
    const context = await buildExecutionContext("mcp-fetcher-prompt-test");

    const prompt = agent.getSystemPrompt(context);
    expect(prompt).toContain("Custom MCP Fetcher Prompt");
    expect(prompt).toContain("universal-agent-skill-creator.md");
  });

  it("falls back when runtime prompt file is unavailable", async () => {
    const agent = new McpFetcherAgent({
      promptFile: "knowledge/sub-agents/mcp-fetcher/not-found.md",
    });
    const context = await buildExecutionContext("mcp-fetcher-fallback-test");

    const prompt = agent.getSystemPrompt(context);
    expect(prompt).toContain("You are the MCP Fetcher sub-agent");
    expect(prompt).toContain("universal-agent-skill-creator.md");
    expect(prompt).not.toContain("{{SKILL_CREATION_INSTRUCTION}}");
    expect(prompt).not.toBe(MCP_FETCHER_SYSTEM_PROMPT_FALLBACK);
  });

  it("returns deterministic error on invalid input", async () => {
    const agent = new McpFetcherAgent();
    const context = await buildExecutionContext("mcp-fetcher-exec-test");

    const result = await agent.execute({}, context);
    expect(result.success).toBe(false);
    expect(result.modelUsed).toBe("none");
    expect(String(result.output)).toContain("Invalid input for mcp-fetcher");
  });
});
