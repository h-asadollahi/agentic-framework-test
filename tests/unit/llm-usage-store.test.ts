import { beforeEach, describe, expect, it, vi } from "vitest";

let currentRepo: Record<string, ReturnType<typeof vi.fn>> | null = null;

vi.mock("../../src/platform/db-repository.js", () => ({
  getPlatformDbRepository: () => currentRepo,
}));

import { llmUsageStore } from "../../src/observability/llm-usage-store.js";

function buildRepo() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    createLlmPromptUsageRun: vi.fn().mockResolvedValue(undefined),
    recordLlmUsageEvent: vi.fn().mockResolvedValue(undefined),
    finalizeLlmPromptUsageRun: vi.fn().mockResolvedValue(undefined),
    getLlmUsageSummary: vi.fn().mockResolvedValue({
      totalPrompts: 2,
      totalLlmCalls: 4,
      totalInputTokens: 300,
      totalOutputTokens: 150,
      totalTokens: 450,
      totalCalls: 4,
      byProvider: [],
      byModel: [],
      daily: [],
    }),
    listLlmPromptUsageRuns: vi.fn().mockResolvedValue({
      total: 1,
      rows: [
        {
          id: 1,
          pipelineRunId: "run-root-1",
          audience: "marketer",
          scope: "brand",
          brandId: "acme-marketing",
          source: "api",
          sessionId: "session-1",
          userPrompt: "Show me my page impressions for the last 7 days",
          inputTokens: 200,
          outputTokens: 50,
          totalTokens: 250,
          llmCallCount: 2,
          status: "completed",
          startedAt: "2026-03-17T09:00:00.000Z",
          finishedAt: "2026-03-17T09:00:02.000Z",
          createdAt: "2026-03-17T09:00:00.000Z",
          updatedAt: "2026-03-17T09:00:02.000Z",
        },
      ],
    }),
  };
}

describe("llmUsageStore", () => {
  beforeEach(() => {
    currentRepo = buildRepo();
  });

  it("creates and finalizes prompt-level usage runs", async () => {
    await llmUsageStore.createPromptRun({
      pipelineRunId: "run-root-1",
      audience: "marketer",
      scope: "brand",
      brandId: "acme-marketing",
      source: "api",
      sessionId: "session-1",
      userPrompt: "Show me my page impressions for the last 7 days",
    });

    await llmUsageStore.finalizePromptRun("run-root-1", "completed");

    expect(currentRepo?.init).toHaveBeenCalledTimes(2);
    expect(currentRepo?.createLlmPromptUsageRun).toHaveBeenCalledWith({
      pipelineRunId: "run-root-1",
      audience: "marketer",
      scope: "brand",
      brandId: "acme-marketing",
      source: "api",
      sessionId: "session-1",
      userPrompt: "Show me my page impressions for the last 7 days",
    });
    expect(currentRepo?.finalizeLlmPromptUsageRun).toHaveBeenCalledWith(
      "run-root-1",
      "completed",
      undefined
    );
  });

  it("records detailed LLM usage events with pipelineRunId and returns prompt-centric summaries", async () => {
    await llmUsageStore.record({
      pipelineRunId: "run-root-1",
      audience: "marketer",
      scope: "brand",
      brandId: "acme-marketing",
      source: "api",
      sessionId: "session-1",
      runId: "run-stage-1",
      componentKind: "agent",
      componentId: "grounding",
      modelAlias: "openai:balanced",
      resolvedModelId: "openai:gpt-5",
      provider: "openai",
      tokensUsed: 250,
      promptTokens: 200,
      completionTokens: 50,
    });

    const summary = await llmUsageStore.getSummary({
      audience: "marketer",
      brandId: "acme-marketing",
      days: 7,
    });
    const prompts = await llmUsageStore.listPromptRuns({
      audience: "marketer",
      brandId: "acme-marketing",
      days: 7,
      limit: 20,
      offset: 0,
    });

    expect(currentRepo?.recordLlmUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineRunId: "run-root-1",
        runId: "run-stage-1",
        promptTokens: 200,
        completionTokens: 50,
      })
    );
    expect(summary.totalPrompts).toBe(2);
    expect(summary.totalInputTokens).toBe(300);
    expect(prompts.total).toBe(1);
    expect(prompts.rows[0]?.pipelineRunId).toBe("run-root-1");
  });

  it("returns safe empty results when the DB repository is unavailable", async () => {
    currentRepo = null;

    const summary = await llmUsageStore.getSummary({
      audience: "marketer",
      days: 7,
    });
    const prompts = await llmUsageStore.listPromptRuns({
      audience: "marketer",
      days: 7,
    });

    expect(summary).toEqual({
      totalPrompts: 0,
      totalLlmCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCalls: 0,
      byProvider: [],
      byModel: [],
      daily: [],
    });
    expect(prompts).toEqual({
      total: 0,
      rows: [],
    });
  });
});
