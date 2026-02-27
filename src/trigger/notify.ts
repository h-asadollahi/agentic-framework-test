import { task, logger } from "@trigger.dev/sdk/v3";
import type { NotificationRequest, NotificationResult } from "../core/types.js";
// Register all channel adapters
import { channelRegistry } from "../channels/index.js";

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

    logger.info(`Sending ${notification.channel} notification`, {
      channel: notification.channel,
      recipient: notification.recipient,
      priority: notification.priority,
    });

    const adapter = channelRegistry.get(notification.channel);

    if (!adapter) {
      logger.error(`No adapter for channel: ${notification.channel}`);
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

    return result;
  },
});
