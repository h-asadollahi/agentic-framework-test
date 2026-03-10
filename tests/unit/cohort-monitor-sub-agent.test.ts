import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  CohortMonitorAgent,
  COHORT_MONITOR_SYSTEM_PROMPT_FALLBACK,
} from "../../src/trigger/sub-agents/plugins/cohort-monitor.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("CohortMonitorAgent prompt + execution", () => {
  it("uses runtime prompt content from knowledge specs", () => {
    const customPromptPath = resolve(
      PROJECT_ROOT,
      "tests/fixtures/cohort-monitor-system-prompt-custom.md"
    );
    const agent = new CohortMonitorAgent({ promptFile: customPromptPath });
    const context = buildExecutionContext("cohort-monitor-prompt-test");

    const prompt = agent.getSystemPrompt(context);
    expect(prompt).toContain(
      `Custom Cohort Monitor Prompt for ${context.brandIdentity.name}`
    );
  });

  it("falls back when runtime prompt file is unavailable", () => {
    const agent = new CohortMonitorAgent({
      promptFile: "knowledge/sub-agents/cohort-monitor/not-found.md",
    });
    const context = buildExecutionContext("cohort-monitor-fallback-test");

    const prompt = agent.getSystemPrompt(context);
    expect(prompt).toContain(context.brandIdentity.name);
    expect(prompt).toContain("You are the Cohort Monitor sub-agent");
    expect(prompt).not.toContain("{{BRAND_NAME}}");
    expect(prompt).not.toBe(COHORT_MONITOR_SYSTEM_PROMPT_FALLBACK);
  });

  it("keeps mock execution behavior for default input", async () => {
    const agent = new CohortMonitorAgent();
    const context = buildExecutionContext("cohort-monitor-exec-test");

    const result = await agent.execute({}, context);
    expect(result.success).toBe(true);
    expect(result.modelUsed).toBe("mock-data-service");
    expect(typeof result.output).toBe("string");
  });
});
