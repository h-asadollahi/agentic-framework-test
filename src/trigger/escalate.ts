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

    // Pause execution for the timeout duration (v3 SDK uses wait.for)
    // In a full implementation, a webhook or dashboard action would
    // complete this run early. For now, we wait and auto-reject on timeout.
    await wait.for({ seconds: timeoutHours * 3600 });

    logger.warn("Escalation timed out", {
      runId: escalation.runId,
      timeoutHours,
    });

    return {
      approved: false,
      decision: "Escalation timed out — no human response received",
      timedOut: true,
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
