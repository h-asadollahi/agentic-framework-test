import { WebClient } from "@slack/web-api";
import type { ChannelAdapter } from "./channel-interface.js";
import type { NotificationRequest, NotificationResult } from "../core/types.js";
import { logger } from "../core/logger.js";

/**
 * Slack Channel Adapter
 *
 * Sends notifications via Slack Web API.
 *
 * Configuration (via environment):
 *   SLACK_BOT_TOKEN — Bot token with chat:write scope
 *   SLACK_ADMIN_HITL_CHANNEL — Default admin HITL Slack channel
 */
export class SlackChannel implements ChannelAdapter {
  readonly channel = "slack";
  private client: WebClient | null = null;
  private defaultChannel: string;

  constructor() {
    const token = process.env.SLACK_BOT_TOKEN;
    this.defaultChannel =
      process.env.SLACK_ADMIN_HITL_CHANNEL ??
      process.env.SLACK_DEFAULT_CHANNEL ??
      "#brand-cp-hitl";

    if (token) {
      this.client = new WebClient(token);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async send(request: NotificationRequest): Promise<NotificationResult> {
    if (!this.client) {
      logger.warn("Slack channel not configured (SLACK_BOT_TOKEN missing)");
      return {
        success: false,
        error: "Slack not configured — set SLACK_BOT_TOKEN env variable",
      };
    }

    const channel = request.recipient || this.defaultChannel;

    try {
      const result = await this.client.chat.postMessage({
        channel,
        text: `*${request.subject}*\n\n${request.body}`,
        mrkdwn: true,
        ...(request.priority === "critical"
          ? {
              attachments: [
                {
                  color: "#FF0000",
                  text: `Priority: ${request.priority.toUpperCase()}`,
                },
              ],
            }
          : {}),
      });

      logger.info("Slack notification sent", {
        channel,
        ts: result.ts,
      });

      return {
        success: true,
        messageId: result.ts ?? `slack-${Date.now()}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Slack notification failed", { channel, error: message });
      return { success: false, error: message };
    }
  }
}

export const slackChannel = new SlackChannel();

/**
 * Factory to create a standalone Slack WebClient.
 *
 * Used by the escalation module which runs inside the Trigger.dev worker
 * process (separate from the Hono server where `slackChannel` lives).
 */
export function createSlackClient(): WebClient | null {
  const token = process.env.SLACK_BOT_TOKEN;
  return token ? new WebClient(token) : null;
}
