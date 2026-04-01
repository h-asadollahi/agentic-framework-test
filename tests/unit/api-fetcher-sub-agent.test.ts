import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  ApiFetcherAgent,
  API_FETCHER_SYSTEM_PROMPT_FALLBACK,
} from "../../src/trigger/sub-agents/plugins/api-fetcher.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("ApiFetcherAgent prompt + execution", () => {
  it("uses runtime prompt content from knowledge specs", async () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/api-fetcher-system-prompt-custom.md"
    );
    const agent = new ApiFetcherAgent({ promptFile: customPromptPath });
    const context = await buildExecutionContext("api-fetcher-prompt-test");

    const prompt = agent.getSystemPrompt(context);
    expect(prompt).toContain("Custom API Fetcher Prompt");
    expect(prompt).toContain("universal-agent-skill-creator.md");
  });

  it("falls back when runtime prompt file is unavailable", async () => {
    const agent = new ApiFetcherAgent({
      promptFile: "knowledge/sub-agents/api-fetcher/not-found.md",
    });
    const context = await buildExecutionContext("api-fetcher-fallback-test");

    const prompt = agent.getSystemPrompt(context);
    expect(prompt).toContain("You are the API Fetcher sub-agent");
    expect(prompt).toContain("universal-agent-skill-creator.md");
    expect(prompt).not.toContain("{{SKILL_CREATION_INSTRUCTION}}");
    expect(prompt).not.toBe(API_FETCHER_SYSTEM_PROMPT_FALLBACK);
  });

  it("returns deterministic error when route is missing", async () => {
    const agent = new ApiFetcherAgent();
    const context = await buildExecutionContext("api-fetcher-exec-test");

    const result = await agent.execute({ routeId: "missing-route" }, context);
    expect(result.success).toBe(false);
    expect(result.modelUsed).toBe("none");
    expect(String(result.output)).toContain("not found");
  });
});
