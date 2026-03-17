import { getPlatformDbRepository } from "../platform/db-repository.js";
import type {
  LlmUsageEventInput,
  LlmUsageSummaryRecord,
} from "../routing/learned-routes-db-repository.js";

class LlmUsageStoreImpl {
  async record(event: LlmUsageEventInput): Promise<void> {
    const repo = getPlatformDbRepository();
    if (!repo) return;
    await repo.init();
    await repo.recordLlmUsageEvent(event);
  }

  async getSummary(options: {
    audience?: "admin" | "marketer";
    brandId?: string | null;
    days?: number;
  } = {}): Promise<LlmUsageSummaryRecord> {
    const repo = getPlatformDbRepository();
    if (!repo) {
      return {
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
}

export const llmUsageStore = new LlmUsageStoreImpl();
