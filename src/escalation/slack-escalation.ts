import { WebClient } from "@slack/web-api";
import { wait } from "@trigger.dev/sdk/v3";
import type { HumanEscalation, EscalationResult } from "../core/types.js";
import { logger } from "../core/logger.js";

// ── Keyword sets for parsing decisions ──────────────────────

const APPROVE_KEYWORDS = ["approve", "approved", "yes", "lgtm", "go ahead", "proceed", "confirmed"];
const REJECT_KEYWORDS = ["reject", "rejected", "no", "deny", "denied", "stop", "cancel"];

// ── Slack client factory ────────────────────────────────────

function getSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set — cannot send escalation messages");
  }
  return new WebClient(token);
}

function getDefaultChannel(): string {
  return (
    process.env.SLACK_HITL_CHANNEL ??
    process.env.MARKETER_SLACK_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#marketing-alerts"
  );
}

function getChannelCandidates(): string[] {
  const candidates = [
    process.env.SLACK_HITL_CHANNEL,
    process.env.MARKETER_SLACK_CHANNEL,
    process.env.SLACK_DEFAULT_CHANNEL,
    "#marketing-alerts",
  ].filter((value): value is string => Boolean(value && value.trim()));

  return [...new Set(candidates)];
}

// ── Send escalation message ─────────────────────────────────

interface SlackMessageRef {
  channel: string;
  ts: string;
}

/**
 * Send a rich Block Kit escalation message to Slack.
 * Returns the channel and message timestamp for thread polling.
 */
export async function sendEscalationMessage(
  escalation: HumanEscalation,
  timeoutMinutes: number
): Promise<SlackMessageRef> {
  const client = getSlackClient();
  const fallbackChannel = getDefaultChannel();
  const channels = getChannelCandidates();

  const severityEmoji: Record<string, string> = {
    critical: ":rotating_light:",
    error: ":red_circle:",
    warning: ":warning:",
    info: ":information_source:",
  };

  const emoji = severityEmoji[escalation.severity] ?? ":bell:";

  const blocks = [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: `${emoji} Action Required: ${escalation.taskDescription}`,
        emoji: true,
      },
    },
    { type: "divider" as const },
    {
      type: "section" as const,
      fields: [
        {
          type: "mrkdwn" as const,
          text: `*Reason:*\n${escalation.reason}`,
        },
        {
          type: "mrkdwn" as const,
          text: `*Severity:*\n${escalation.severity.toUpperCase()}`,
        },
        {
          type: "mrkdwn" as const,
          text: `*Run ID:*\n\`${escalation.runId}\``,
        },
        {
          type: "mrkdwn" as const,
          text: `*Auto-rejects in:*\n${timeoutMinutes} minutes`,
        },
      ],
    },
    { type: "divider" as const },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: [
          "*Reply in this thread to decide:*",
          "",
          "> :white_check_mark: `approve` — approve the action",
          "> :x: `reject` — reject the action",
          "> :speech_balloon: Any other text — add feedback (polling continues)",
        ].join("\n"),
      },
    },
    {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: `:clock1: _This escalation will auto-reject if no decision is received within ${timeoutMinutes} minutes._`,
        },
      ],
    },
  ];

  let lastError: unknown = null;

  for (const channel of channels) {
    try {
      const result = await client.chat.postMessage({
        channel,
        text: `Action Required: ${escalation.taskDescription}`, // fallback for notifications
        blocks,
      });

      if (!result.ok || !result.ts) {
        throw new Error(`Failed to send escalation message: ${result.error ?? "unknown error"}`);
      }

      const resolvedChannel = result.channel ?? channel;

      logger.info("Escalation message sent to Slack", {
        channel: resolvedChannel,
        ts: result.ts,
        runId: escalation.runId,
      });

      return { channel: resolvedChannel, ts: result.ts };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("channel_not_found")) {
        logger.warn("Escalation channel not found, trying next configured channel", {
          attemptedChannel: channel,
          runId: escalation.runId,
        });
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to send escalation message to all channel candidates (fallback: ${fallbackChannel})`);
}

// ── Poll for thread replies ─────────────────────────────────

interface ParsedDecision {
  approved: boolean;
  decision: string;
  decidedBy: string;
}

/**
 * Check if a reply text contains an approval or rejection keyword.
 */
function parseReplyText(text: string): ParsedDecision | null {
  const lower = text.toLowerCase().trim();

  for (const keyword of APPROVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        approved: true,
        decision: `Approved (reply: "${text.slice(0, 100)}")`,
        decidedBy: "", // filled by caller
      };
    }
  }

  for (const keyword of REJECT_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        approved: false,
        decision: `Rejected (reply: "${text.slice(0, 100)}")`,
        decidedBy: "", // filled by caller
      };
    }
  }

  return null; // not a decision — treat as feedback
}

/**
 * Poll a Slack thread for human replies until a decision is found or timeout.
 *
 * Uses Trigger.dev `wait.for()` between polls to free the worker.
 * Each poll checks `conversations.replies` for new messages.
 */
export async function pollForDecision(
  channel: string,
  threadTs: string,
  timeoutSeconds: number,
  pollIntervalSeconds: number = 30
): Promise<EscalationResult> {
  const client = getSlackClient();
  const maxAttempts = Math.ceil(timeoutSeconds / pollIntervalSeconds);
  const collectedFeedback: string[] = [];

  logger.info("Starting escalation poll loop", {
    channel,
    threadTs,
    timeoutSeconds,
    pollIntervalSeconds,
    maxAttempts,
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before polling (skip on first iteration for immediate check)
    if (attempt > 0) {
      await wait.for({ seconds: pollIntervalSeconds });
    }

    try {
      const repliesResult = await client.conversations.replies({
        channel,
        ts: threadTs,
        limit: 20,
      });

      const messages = repliesResult.messages ?? [];

      // Skip the first message (that's the original escalation post)
      const replies = messages.slice(1);

      if (replies.length === 0) {
        logger.debug?.(`Poll attempt ${attempt + 1}/${maxAttempts}: no replies yet`);
        continue;
      }

      // Check each reply for a decision (newest first)
      for (const reply of replies.reverse()) {
        const text = reply.text ?? "";
        const userId = reply.user ?? "unknown";

        // Skip bot messages (our own confirmations)
        if (reply.bot_id) continue;

        const parsed = parseReplyText(text);

        if (parsed) {
          logger.info("Escalation decision received", {
            approved: parsed.approved,
            decidedBy: userId,
            attempt: attempt + 1,
          });

          return {
            approved: parsed.approved,
            decision: parsed.decision,
            decidedBy: userId,
            feedback: collectedFeedback.length > 0 ? collectedFeedback.join("\n") : undefined,
            slackThreadTs: threadTs,
            timedOut: false,
          };
        }

        // Not a decision — collect as feedback
        if (!collectedFeedback.includes(text)) {
          collectedFeedback.push(text);
          logger.info("Escalation feedback received (not a decision)", {
            feedback: text.slice(0, 100),
            user: userId,
          });
        }
      }
    } catch (error) {
      // Log but don't fail — Slack API hiccup shouldn't kill the escalation
      logger.warn("Failed to poll Slack thread for replies", {
        error: error instanceof Error ? error.message : String(error),
        attempt: attempt + 1,
      });
    }
  }

  // Timeout — no decision received
  logger.warn("Escalation poll timed out", {
    channel,
    threadTs,
    totalAttempts: maxAttempts,
    feedbackCount: collectedFeedback.length,
  });

  return {
    approved: false,
    decision: "Escalation timed out — no human decision received",
    feedback: collectedFeedback.length > 0 ? collectedFeedback.join("\n") : undefined,
    slackThreadTs: threadTs,
    timedOut: true,
  };
}

// ── Post decision confirmation ──────────────────────────────

/**
 * Post a confirmation message in the escalation thread.
 */
export async function postDecisionConfirmation(
  channel: string,
  threadTs: string,
  decision: EscalationResult
): Promise<void> {
  const client = getSlackClient();

  let text: string;

  if (decision.timedOut) {
    text = ":hourglass: *Escalation timed out* — auto-rejected (no response received).";
  } else if (decision.approved) {
    text = `:white_check_mark: *Approved* by <@${decision.decidedBy ?? "unknown"}>`;
  } else {
    text = `:x: *Rejected* by <@${decision.decidedBy ?? "unknown"}>`;
  }

  if (decision.feedback) {
    text += `\n\n_Feedback collected:_\n> ${decision.feedback.split("\n").join("\n> ")}`;
  }

  try {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      mrkdwn: true,
    });

    logger.info("Escalation confirmation posted", {
      channel,
      threadTs,
      approved: decision.approved,
      timedOut: decision.timedOut,
    });
  } catch (error) {
    // Non-critical — log and move on
    logger.warn("Failed to post escalation confirmation", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
