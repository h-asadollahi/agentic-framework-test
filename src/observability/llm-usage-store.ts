import { getPlatformDbRepository } from "../platform/db-repository.js";
import type {
  LlmPromptUsageListOptions,
  LlmPromptUsageRunInput,
  LlmPromptUsageRunRecord,
  LlmPromptUsageRunStatus,
  LlmUsageEventInput,
  LlmUsageSummaryRecord,
} from "../routing/learned-routes-db-repository.js";

class LlmUsageStoreImpl {
  async createPromptRun(input: LlmPromptUsageRunInput): Promise<void> {
    const repo = getPlatformDbRepository();
    if (!repo) return;
    await repo.init();
    await repo.createLlmPromptUsageRun(input);
  }

  async record(event: LlmUsageEventInput): Promise<void> {
    const repo = getPlatformDbRepository();
    if (!repo) return;
    await repo.init();
    await repo.recordLlmUsageEvent(event);
  }

  async finalizePromptRun(
    pipelineRunId: string,
    status: LlmPromptUsageRunStatus,
    finishedAt?: string | null
  ): Promise<void> {
    const repo = getPlatformDbRepository();
    if (!repo) return;
    await repo.init();
    await repo.finalizeLlmPromptUsageRun(pipelineRunId, status, finishedAt);
  }

  async getSummary(options: {
    audience?: "admin" | "marketer";
    brandId?: string | null;
    days?: number;
    groupBy?: "day" | "month";
  } = {}): Promise<LlmUsageSummaryRecord> {
    const repo = getPlatformDbRepository();
    if (!repo) {
      return {
        totalPrompts: 0,
        totalLlmCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCalls: 0,
        byProvider: [],
        byModel: [],
        daily: [],
      };
    }

    await repo.init();
    return repo.getLlmUsageSummary(options);
  }

  async listPromptRuns(
    options: LlmPromptUsageListOptions = {}
  ): Promise<{ total: number; rows: LlmPromptUsageRunRecord[] }> {
    const repo = getPlatformDbRepository();
    if (!repo) {
      return {
        total: 0,
        rows: [],
      };
    }

    await repo.init();
    return repo.listLlmPromptUsageRuns(options);
  }
}

export const llmUsageStore = new LlmUsageStoreImpl();
