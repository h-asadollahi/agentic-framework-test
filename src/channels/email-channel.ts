import sgMail from "@sendgrid/mail";
import type { ChannelAdapter } from "./channel-interface.js";
import type { NotificationRequest, NotificationResult } from "../core/types.js";
import { logger } from "../core/logger.js";

/**
 * Email Channel Adapter
 *
 * Sends notifications via SendGrid.
 *
 * Configuration (via environment):
 *   SENDGRID_API_KEY — SendGrid API key
 *   EMAIL_FROM_ADDRESS — Verified sender address
 *   EMAIL_FROM_NAME — Sender display name
 */
export class EmailChannel implements ChannelAdapter {
  readonly channel = "email";
  private configured: boolean;
  private fromAddress: string;
  private fromName: string;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "noreply@example.com";
    this.fromName = process.env.EMAIL_FROM_NAME ?? "Marketing Agent";
    this.configured = !!apiKey;

    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(request: NotificationRequest): Promise<NotificationResult> {
    if (!this.configured) {
      logger.warn("Email channel not configured (SENDGRID_API_KEY missing)");
      return {
        success: false,
        error: "Email not configured — set SENDGRID_API_KEY env variable",
      };
    }

    if (!request.recipient) {
      return { success: false, error: "No recipient email address provided" };
    }

    try {
      const [response] = await sgMail.send({
        to: request.recipient,
        from: { email: this.fromAddress, name: this.fromName },
        subject: request.subject,
        text: request.body,
        html: formatHtml(request),
      });

      const messageId = response.headers?.["x-message-id"] ?? `email-${Date.now()}`;

      logger.info("Email notification sent", {
        to: request.recipient,
        subject: request.subject,
        messageId,
      });

      return { success: true, messageId: String(messageId) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Email notification failed", {
        to: request.recipient,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}

function formatHtml(request: NotificationRequest): string {
  const priorityColor =
    request.priority === "critical"
      ? "#FF0000"
      : request.priority === "warning"
        ? "#FF9900"
        : "#333333";

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${priorityColor};">${request.subject}</h2>
      <div style="white-space: pre-wrap; line-height: 1.6;">${request.body}</div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">
        Priority: ${request.priority} | Sent by Marketing Agent
      </p>
    </div>
  `;
}

export const emailChannel = new EmailChannel();
