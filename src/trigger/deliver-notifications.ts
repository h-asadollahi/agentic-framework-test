import type { AgencyResult, NotificationRequest } from "../core/types.js";

function readIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAdminHumanReviewRecipient(): string {
  return (
    process.env.SLACK_ADMIN_HITL_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#brand-cp-hitl"
  );
}

function getAdminMonitoringRecipient(): string {
  return (
    process.env.SLACK_ADMIN_MONITORING_CHANNEL ??
    process.env.SLACK_ADMIN_HITL_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#brand-cp-hitl"
  );
}

function getMarketerHumanReviewRecipient(): string {
  return (
    process.env.SLACK_MARKETERS_HITL_CHANNEL ??
    process.env.SLACK_MARKETERS_MONITORING_CHANNEL ??
    process.env.SLACK_ADMIN_HITL_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#brand-cp-hitl"
  );
}

function getMarketerMonitoringRecipient(): string {
  return (
    process.env.SLACK_MARKETERS_MONITORING_CHANNEL ??
    process.env.SLACK_ADMIN_MONITORING_CHANNEL ??
    process.env.SLACK_ADMIN_HITL_CHANNEL ??
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

function hasCriticalIssue(issue: string): boolean {
  return /\b(critical|security|unauthorized|permission|failed|failure|error|panic|outage)\b/i.test(
    issue
  );
}

function shouldEscalateHumanReviewToAdmin(agencyResult: AgencyResult): boolean {
  if (agencyResult.needsHumanReview !== true) return false;
  const failureIssues = getResultFailureIssues(agencyResult);
  if (failureIssues.length > 0) return true;
  const explicitIssues = readIssues(agencyResult.issues);
  return explicitIssues.some(hasCriticalIssue);
}

export function buildHumanReviewSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  if (!shouldEscalateHumanReviewToAdmin(agencyResult)) {
    return null;
  }

  const recipient = getAdminHumanReviewRecipient();

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
  const recipient = getAdminHumanReviewRecipient();
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

export function buildMarketerHumanReviewSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  if (agencyResult.needsHumanReview !== true) return null;
  if (shouldEscalateHumanReviewToAdmin(agencyResult)) return null;

  const recipient = getMarketerHumanReviewRecipient();
  const summary = String(agencyResult.summary ?? "Marketer review suggested");
  const explicitIssues = readIssues(agencyResult.issues);
  const issueSection =
    explicitIssues.length > 0
      ? `\n\nIssues:\n${explicitIssues.map((issue) => `- ${issue}`).join("\n")}`
      : "";

  return {
    channel: "slack",
    recipient,
    subject: "Marketer Review Suggested",
    body: `${summary}${issueSection}`,
    priority: "warning",
    metadata: {
      source: "deliver-marketer-human-review-fallback",
    },
  };
}

export function ensureMarketerHumanReviewSlackNotification(
  agencyResult: AgencyResult,
  notifications: NotificationRequest[]
): NotificationRequest[] {
  const recipient = getMarketerHumanReviewRecipient();
  const alreadyExists = notifications.some(
    (n) =>
      n.channel === "slack" &&
      (n.recipient === recipient ||
        n.metadata?.source === "deliver-marketer-human-review-fallback")
  );
  if (alreadyExists) return notifications;

  const fallback = buildMarketerHumanReviewSlackNotification(agencyResult);
  if (!fallback) return notifications;

  return [...notifications, fallback];
}

export function buildMonitoringSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  const failureIssues = getResultFailureIssues(agencyResult);
  if (failureIssues.length === 0) return null;

  const recipient = getAdminMonitoringRecipient();
  const summary = String(agencyResult.summary ?? "Pipeline completed with issues");

  return {
    channel: "slack",
    recipient,
    subject: "Pipeline Monitoring Alert",
    body: `${summary}\n\nIssues:\n${failureIssues.map((issue) => `- ${issue}`).join("\n")}`,
    priority: "warning",
    metadata: {
      source: "deliver-admin-monitoring-fallback",
    },
  };
}

export function ensureMonitoringSlackNotification(
  agencyResult: AgencyResult,
  notifications: NotificationRequest[]
): NotificationRequest[] {
  const recipient = getAdminMonitoringRecipient();
  const alreadyHasMonitoringSlack = notifications.some(
    (n) =>
      n.channel === "slack" &&
      (n.recipient === recipient ||
        n.metadata?.source === "deliver-admin-monitoring-fallback")
  );
  if (alreadyHasMonitoringSlack) return notifications;

  const fallback = buildMonitoringSlackNotification(agencyResult);
  if (!fallback) return notifications;

  return [...notifications, fallback];
}

export function buildMarketerMonitoringSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  const explicitIssues = readIssues(agencyResult.issues);
  if (explicitIssues.length === 0) return null;

  const recipient = getMarketerMonitoringRecipient();
  const summary = String(agencyResult.summary ?? "Pipeline completed with warnings");

  return {
    channel: "slack",
    recipient,
    subject: "Marketer Monitoring Alert",
    body: `${summary}\n\nIssues:\n${explicitIssues
      .map((issue) => `- ${issue}`)
      .join("\n")}`,
    priority: "warning",
    metadata: {
      source: "deliver-marketer-monitoring-fallback",
    },
  };
}

export function ensureMarketerMonitoringSlackNotification(
  agencyResult: AgencyResult,
  notifications: NotificationRequest[]
): NotificationRequest[] {
  const recipient = getMarketerMonitoringRecipient();
  const alreadyHasMonitoringSlack = notifications.some(
    (n) =>
      n.channel === "slack" &&
      (n.recipient === recipient ||
        n.metadata?.source === "deliver-marketer-monitoring-fallback")
  );
  if (alreadyHasMonitoringSlack) return notifications;

  const fallback = buildMarketerMonitoringSlackNotification(agencyResult);
  if (!fallback) return notifications;

  return [...notifications, fallback];
}

export function normalizeSlackNotificationRecipients(
  agencyResult: AgencyResult,
  notifications: NotificationRequest[]
): NotificationRequest[] {
  const adminHitl = getAdminHumanReviewRecipient();
  const marketerHitl = getMarketerHumanReviewRecipient();
  const adminMonitoring = getAdminMonitoringRecipient();
  const marketerMonitoring = getMarketerMonitoringRecipient();
  const hasFailures = getResultFailureIssues(agencyResult).length > 0;
  const allowAdminHitl = shouldEscalateHumanReviewToAdmin(agencyResult);

  return notifications
    .map((notification) => {
      if (notification.channel !== "slack") return notification;

      const subject = String(notification.subject ?? "").toLowerCase();
      const body = String(notification.body ?? "").toLowerCase();
      const looksHumanReview =
        subject.includes("human review") || body.includes("human review");
      const looksMonitoring =
        subject.includes("monitor") ||
        subject.includes("alert") ||
        subject.includes("technical") ||
        body.includes("issues:") ||
        body.includes("warning") ||
        body.includes("failed") ||
        body.includes("non-functional");

      if (looksHumanReview) {
        return {
          ...notification,
          recipient: allowAdminHitl ? adminHitl : marketerHitl,
        };
      }

      if (looksMonitoring) {
        return {
          ...notification,
          recipient: hasFailures ? adminMonitoring : marketerMonitoring,
        };
      }

      return notification;
    })
    .filter((n): n is NotificationRequest => n !== null);
}
