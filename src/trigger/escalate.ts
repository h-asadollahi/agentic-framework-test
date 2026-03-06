import { task, logger } from "@trigger.dev/sdk/v3";
import type {
  HumanEscalation,
  NotificationRequest,
  EscalationPayload,
  EscalationResult,
} from "../core/types.js";
import { notifyTask } from "./notify.js";
import {
  sendEscalationMessage,
  pollForDecision,
  postDecisionConfirmation,
} from "../escalation/slack-escalation.js";

/**
 * Escalation Task — Human-in-the-Loop via Slack Thread Replies
 *
 * When an agent encounters a situation that requires human judgment:
 *
 * 1. Sends a rich Block Kit message to the Slack channel
 * 2. Optionally sends an email notification to the admin
 * 3. Polls the Slack thread every 30 seconds for human replies
 * 4. Parses "approve" / "reject" keywords from thread replies
 * 5. Posts a confirmation message in the thread
 * 6. Returns the human's decision to the calling agent
 *
 * If no decision is received within the timeout, auto-rejects.
 */
export const escalateTask = task({
  id: "escalate-to-human",
  retry: { maxAttempts: 1 }, // don't retry escalations
  run: async (payload: EscalationPayload): Promise<EscalationResult> => {
    const { escalation, timeoutMinutes = 60 } = payload;

    logger.info("Human escalation triggered", {
      runId: escalation.runId,
      reason: escalation.reason,
      severity: escalation.severity,
      timeoutMinutes,
    });

    // ── 1. Send Escalation Message to Slack ─────────────────
    let slackRef: { channel: string; ts: string };

    try {
      slackRef = await sendEscalationMessage(escalation, timeoutMinutes);
    } catch (error) {
      logger.error("Failed to send escalation to Slack — auto-rejecting", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        approved: false,
        decision: "Failed to send escalation message to Slack",
        timedOut: false,
      };
    }

    // ── 2. Send Email Notification (fire-and-forget) ────────
    if (escalation.notifyAdmin) {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        const emailNotification: NotificationRequest = {
          channel: "email",
          recipient: adminEmail,
          subject: `[${escalation.severity.toUpperCase()}] Agent Escalation: ${escalation.taskDescription}`,
          body: formatEscalationEmail(escalation, slackRef),
          priority: escalation.severity === "critical" ? "critical" : "warning",
        };
        await notifyTask.trigger({ notification: emailNotification });
      }
    }

    // ── 3. Poll Slack Thread for Decision ────────────────────
    logger.info("Polling Slack thread for human decision", {
      channel: slackRef.channel,
      threadTs: slackRef.ts,
      timeoutMinutes,
    });

    const decision = await pollForDecision(
      slackRef.channel,
      slackRef.ts,
      timeoutMinutes * 60, // convert to seconds
      30 // poll every 30 seconds
    );

    // ── 4. Post Confirmation in Thread ──────────────────────
    await postDecisionConfirmation(slackRef.channel, slackRef.ts, decision);

    logger.info("Escalation resolved", {
      runId: escalation.runId,
      approved: decision.approved,
      timedOut: decision.timedOut,
      decidedBy: decision.decidedBy,
    });

    return decision;
  },
});

// ── Helpers ─────────────────────────────────────────────────

function formatEscalationEmail(
  escalation: HumanEscalation,
  slackRef: { channel: string; ts: string }
): string {
  return [
    `**Task:** ${escalation.taskDescription}`,
    `**Reason:** ${escalation.reason}`,
    `**Severity:** ${escalation.severity}`,
    `**Run ID:** ${escalation.runId}`,
    "",
    `A Slack message has been sent to channel ${slackRef.channel}.`,
    "Reply in the Slack thread to approve or reject this escalation.",
  ].join("\n");
}
