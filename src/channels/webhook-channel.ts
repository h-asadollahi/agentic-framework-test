import type { ChannelAdapter } from "./channel-interface.js";
import type { NotificationRequest, NotificationResult } from "../core/types.js";
import { logger } from "../core/logger.js";

/**
 * Webhook Channel Adapter
 *
 * Sends notifications to arbitrary HTTP endpoints via POST.
 *
 * Configuration (via environment):
 *   WEBHOOK_SECRET — Optional shared secret for HMAC signing
 *
 * The recipient field on the notification is used as the webhook URL.
 */
export class WebhookChannel implements ChannelAdapter {
  readonly channel = "webhook";
  private secret: string | undefined;

  constructor() {
    this.secret = process.env.WEBHOOK_SECRET;
  }

  isConfigured(): boolean {
    // Webhooks are always "configured" — the URL comes per-notification
    return true;
  }

  async send(request: NotificationRequest): Promise<NotificationResult> {
    const url = request.recipient;

    if (!url) {
      return { success: false, error: "No webhook URL provided in recipient field" };
    }

    try {
      new URL(url); // validate URL format
    } catch {
      return { success: false, error: `Invalid webhook URL: ${url}` };
    }

    const payload = {
      subject: request.subject,
      body: request.body,
      priority: request.priority,
      channel: request.channel,
      metadata: request.metadata,
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.secret) {
      const signature = await computeHmac(this.secret, JSON.stringify(payload));
      headers["X-Webhook-Signature"] = signature;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.error("Webhook returned non-OK status", {
          url,
          status: response.status,
          body: text.slice(0, 200),
        });
        return {
          success: false,
          error: `Webhook returned ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      logger.info("Webhook notification sent", { url, status: response.status });
      return { success: true, messageId: `webhook-${Date.now()}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Webhook notification failed", { url, error: message });
      return { success: false, error: message };
    }
  }
}

async function computeHmac(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const webhookChannel = new WebhookChannel();
