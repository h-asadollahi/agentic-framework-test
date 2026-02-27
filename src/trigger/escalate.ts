import { task, logger, wait } from "@trigger.dev/sdk/v3";
import type { HumanEscalation, NotificationRequest } from "../core/types.js";
import { notifyTask } from "./notify.js";

/**
 * Escalation Task
 *
 * Handles human-in-the-loop escalation. When an agent encounters a situation
 * that requires human judgment:
 *
 * 1. Sends notification(s) to the marketer / admin
 * 2. Pauses execution using trigger.dev wait.for()
 * 3. Resumes when a human provides a decision via token completion
 *
 * The calling agent triggers this task and receives the human's decision
 * as the return value.
 */

interface EscalationPayload {
  escalation: HumanEscalation;
  timeoutHours?: number;
}

interface EscalationResult {
  approved: boolean;
  decision: string;
  decidedBy?: string;
  timedOut: boolean;
}

export const escalateTask = task({
  id: "escalate-to-human",
  retry: { maxAttempts: 1 }, // don't retry escalations
  run: async (payload: EscalationPayload): Promise<EscalationResult> => {
    const { escalation, timeoutHours = 24 } = payload;

    logger.info("Human escalation triggered", {
      runId: escalation.runId,
      reason: escalation.reason,
      severity: escalation.severity,
    });

    // ── Send Notifications ──────────────────────────────────
    const notifications: NotificationRequest[] = [];

    if (escalation.notifyMarketer) {
      notifications.push({
        channel: "slack",
        recipient: process.env.MARKETER_SLACK_CHANNEL ?? "#marketing-alerts",
        subject: `Action Required: ${escalation.taskDescription}`,
        body: formatEscalationMessage(escalation),
        priority: escalation.severity === "critical" ? "critical" : "warning",
      });
    }

    if (escalation.notifyAdmin) {
      notifications.push({
        channel: "email",
        recipient: process.env.ADMIN_EMAIL ?? "",
        subject: `[${escalation.severity.toUpperCase()}] Agent Escalation: ${escalation.taskDescription}`,
        body: formatEscalationMessage(escalation),
        priority: escalation.severity === "critical" ? "critical" : "warning",
      });
    }

    // Fire-and-forget notifications
    for (const notification of notifications) {
      await notifyTask.trigger({ notification });
    }

    // ── Wait for Human Decision ─────────────────────────────
    logger.info("Waiting for human decision", {
      runId: escalation.runId,
      timeoutHours,
    });

    const tokenId = `escalation-${escalation.runId}-${Date.now()}`;

    // Create a waitpoint token that a human can complete via the API
    const token = await wait.createToken({
      idempotencyKey: tokenId,
      timeout: `${timeoutHours}h`,
      tags: [`escalation`, `severity:${escalation.severity}`, `run:${escalation.runId}`],
    });

    logger.info("Waitpoint token created", { tokenId: token.id });

    // Pause execution until the token is completed or times out
    const result = await wait.forToken<{ approved: boolean; decision: string; decidedBy?: string }>(token);

    if (!result.ok) {
      logger.warn("Escalation timed out", {
        runId: escalation.runId,
        tokenId: token.id,
        timeoutHours,
      });

      return {
        approved: false,
        decision: "Escalation timed out — no human response received",
        timedOut: true,
      };
    }

    logger.info("Human decision received", {
      runId: escalation.runId,
      approved: result.output.approved,
      decidedBy: result.output.decidedBy,
    });

    return {
      approved: result.output.approved,
      decision: result.output.decision,
      decidedBy: result.output.decidedBy,
      timedOut: false,
    };
  },
});

function formatEscalationMessage(escalation: HumanEscalation): string {
  return [
    `**Task:** ${escalation.taskDescription}`,
    `**Reason:** ${escalation.reason}`,
    `**Severity:** ${escalation.severity}`,
    `**Run ID:** ${escalation.runId}`,
    "",
    "Please review and respond via the dashboard to approve or reject this action.",
  ].join("\n");
}
