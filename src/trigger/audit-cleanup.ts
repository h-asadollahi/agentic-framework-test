import { task, logger } from "@trigger.dev/sdk/v3";
import { agentAuditStore } from "../observability/agent-audit-store.js";

export const auditCleanupTask = task({
  id: "pipeline-audit-cleanup",
  retry: { maxAttempts: 1 },
  run: async (payload: { retentionDays?: number } = {}) => {
    const retentionDays = Math.max(1, Math.floor(payload.retentionDays ?? 7));
    const deletedEvents = await agentAuditStore.cleanupExpired(retentionDays);

    logger.info("Agent audit cleanup completed", {
      retentionDays,
      deletedEvents,
    });

    return {
      retentionDays,
      deletedEvents,
      cleanedAt: new Date().toISOString(),
    };
  },
});
