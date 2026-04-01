import { task, logger } from "@trigger.dev/sdk/v3";
import type { NotificationRequest, NotificationResult } from "../core/types.js";
// Register all channel adapters
import { channelRegistry } from "../channels/index.js";
import { agentAuditStore } from "../observability/agent-audit-store.js";

/**
 * Notify Task
 *
 * Sends a notification via the appropriate channel adapter.
 * Called by the orchestrator after the deliver stage if notifications are needed,
 * or by the escalation task for human-in-the-loop alerts.
 *
 * Dispatches to the channel registry which routes to Slack, Email, or Webhook adapters.
 */
export const notifyTask = task({
  id: "send-notification",
  retry: { maxAttempts: 3 },
  run: async (payload: { notification: NotificationRequest }): Promise<NotificationResult> => {
    const { notification } = payload;
    const requestContext = notification.metadata?.requestContext as
      | NotificationRequest["metadata"]
      | undefined;
    const pipelineRunId =
      typeof requestContext?.pipelineRunId === "string"
        ? requestContext.pipelineRunId
        : typeof requestContext?.sessionId === "string"
          ? requestContext.sessionId
          : "notification";
    const sessionId =
      typeof notification.metadata?.sessionId === "string"
        ? notification.metadata.sessionId
        : pipelineRunId;

    logger.info(`Sending ${notification.channel} notification`, {
      channel: notification.channel,
      recipient: notification.recipient,
      priority: notification.priority,
    });
    await agentAuditStore.record({
      pipelineRunId,
      runId:
        typeof notification.metadata?.runId === "string"
          ? notification.metadata.runId
          : sessionId,
      sessionId,
      phase: "notification",
      componentKind: "notification",
      componentId: notification.channel,
      eventType: "invoke",
      status: "running",
      audience:
        requestContext?.audience === "admin" ? "admin" : "marketer",
      scope: requestContext?.scope === "brand" ? "brand" : "global",
      brandId:
        typeof requestContext?.brandId === "string" ? requestContext.brandId : null,
      payload: {
        recipient: notification.recipient,
        subject: notification.subject,
        priority: notification.priority,
      },
    });

    const adapter = channelRegistry.get(notification.channel);

    if (!adapter) {
      logger.error(`No adapter for channel: ${notification.channel}`);
      await agentAuditStore.record({
        pipelineRunId,
        runId:
          typeof notification.metadata?.runId === "string"
            ? notification.metadata.runId
            : sessionId,
        sessionId,
        phase: "notification",
        componentKind: "notification",
        componentId: notification.channel,
        eventType: "error",
        status: "failed",
        audience:
          requestContext?.audience === "admin" ? "admin" : "marketer",
        scope: requestContext?.scope === "brand" ? "brand" : "global",
        brandId:
          typeof requestContext?.brandId === "string" ? requestContext.brandId : null,
        payload: {
          message: `Unknown channel: ${notification.channel}`,
        },
      });
      return {
        success: false,
        error: `Unknown channel: ${notification.channel}`,
      };
    }

    if (!adapter.isConfigured()) {
      logger.warn(`Channel "${notification.channel}" is not configured, sending anyway (adapter will report error)`);
    }

    const result = await adapter.send(notification);

    if (result.success) {
      logger.info(`Notification sent via ${notification.channel}`, {
        messageId: result.messageId,
      });
    } else {
      logger.error(`Notification failed via ${notification.channel}`, {
        error: result.error,
      });
    }

    await agentAuditStore.record({
      pipelineRunId,
      runId:
        typeof notification.metadata?.runId === "string"
          ? notification.metadata.runId
          : sessionId,
      sessionId,
      phase: "notification",
      componentKind: "notification",
      componentId: notification.channel,
      eventType: "result",
      status: result.success ? "completed" : "failed",
      audience:
        requestContext?.audience === "admin" ? "admin" : "marketer",
      scope: requestContext?.scope === "brand" ? "brand" : "global",
      brandId:
        typeof requestContext?.brandId === "string" ? requestContext.brandId : null,
      payload: {
        recipient: notification.recipient,
        messageId: result.messageId ?? null,
        error: result.error ?? null,
      },
    });

    return result;
  },
});
