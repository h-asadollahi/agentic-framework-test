import { task, logger } from "@trigger.dev/sdk/v3";
import type { NotificationRequest, NotificationResult } from "../core/types.js";

/**
 * Notify Task
 *
 * Sends a notification via the appropriate channel (Slack, Email, Webhook).
 * Called by the orchestrator after the deliver stage if notifications are needed.
 *
 * Channel adapters (Phase 6) will be plugged in here.
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

    // Channel adapter dispatch — will be implemented in Phase 6
    switch (notification.channel) {
      case "slack":
        logger.info("Slack notification (adapter not yet connected)", {
          recipient: notification.recipient,
          subject: notification.subject,
        });
        // TODO: Phase 6 — slackChannel.send(notification)
        return { success: true, messageId: `slack-placeholder-${Date.now()}` };

      case "email":
        logger.info("Email notification (adapter not yet connected)", {
          recipient: notification.recipient,
          subject: notification.subject,
        });
        // TODO: Phase 6 — emailChannel.send(notification)
        return { success: true, messageId: `email-placeholder-${Date.now()}` };

      case "webhook":
        logger.info("Webhook notification (adapter not yet connected)", {
          recipient: notification.recipient,
        });
        // TODO: Phase 6 — webhookChannel.send(notification)
        return { success: true, messageId: `webhook-placeholder-${Date.now()}` };

      default:
        logger.error(`Unknown notification channel: ${notification.channel}`);
        return { success: false, error: `Unknown channel: ${notification.channel}` };
    }
  },
});
