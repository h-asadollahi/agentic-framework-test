import type { AgencyResult, NotificationRequest } from "../core/types.js";

function readIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getHumanReviewRecipient(): string {
  return (
    process.env.SLACK_HITL_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#brand-cp-hitl"
  );
}

function getMonitoringRecipient(): string {
  return (
    process.env.SLACK_MONITORING_CHANNEL ??
    process.env.SLACK_HITL_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#brand-cp-hitl"
  );
}

function getResultFailureIssues(agencyResult: AgencyResult): string[] {
  return agencyResult.results
    .filter((entry) => entry.result.success === false)
    .map(
      (entry) =>
        `Subtask "${entry.subtaskId}" (${entry.agentId}) failed: ${String(
          entry.result.output ?? "unknown error"
        ).slice(0, 240)}`
    );
}

function getAllIssues(agencyResult: AgencyResult): string[] {
  const explicitIssues = readIssues(agencyResult.issues);
  const failureIssues = getResultFailureIssues(agencyResult);
  return [...explicitIssues, ...failureIssues];
}

export function buildHumanReviewSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  if (agencyResult.needsHumanReview !== true) {
    return null;
  }

  const recipient = getHumanReviewRecipient();

  const summary = String(agencyResult.summary ?? "Human review requested");
  const issues = getAllIssues(agencyResult);
  const issueSection =
    issues.length > 0
      ? `\n\nIssues:\n${issues.map((issue) => `- ${issue}`).join("\n")}`
      : "";

  return {
    channel: "slack",
    recipient,
    subject: "Human Review Required",
    body: `${summary}${issueSection}`,
    priority: "warning",
    metadata: {
      source: "deliver-human-review-fallback",
    },
  };
}

export function ensureHumanReviewSlackNotification(
  agencyResult: AgencyResult,
  notifications: NotificationRequest[]
): NotificationRequest[] {
  const recipient = getHumanReviewRecipient();
  const alreadyHasHumanReviewSlack = notifications.some(
    (n) =>
      n.channel === "slack" &&
      (n.recipient === recipient ||
        n.metadata?.source === "deliver-human-review-fallback")
  );
  if (alreadyHasHumanReviewSlack) return notifications;

  const fallback = buildHumanReviewSlackNotification(agencyResult);
  if (!fallback) return notifications;

  return [...notifications, fallback];
}

export function buildMonitoringSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  const issues = getAllIssues(agencyResult);
  if (issues.length === 0) return null;

  const recipient = getMonitoringRecipient();
  const summary = String(agencyResult.summary ?? "Pipeline completed with issues");

  return {
    channel: "slack",
    recipient,
    subject: "Pipeline Monitoring Alert",
    body: `${summary}\n\nIssues:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    priority: "warning",
    metadata: {
      source: "deliver-monitoring-fallback",
    },
  };
}

export function ensureMonitoringSlackNotification(
  agencyResult: AgencyResult,
  notifications: NotificationRequest[]
): NotificationRequest[] {
  const recipient = getMonitoringRecipient();
  const alreadyHasMonitoringSlack = notifications.some(
    (n) =>
      n.channel === "slack" &&
      (n.recipient === recipient ||
        n.metadata?.source === "deliver-monitoring-fallback")
  );
  if (alreadyHasMonitoringSlack) return notifications;

  const fallback = buildMonitoringSlackNotification(agencyResult);
  if (!fallback) return notifications;

  return [...notifications, fallback];
}
