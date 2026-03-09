import type { AgencyResult, NotificationRequest } from "../core/types.js";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function readIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Agency output may contain additional fields (e.g. needsHumanReview, issues)
 * beyond the strict AgencyResult type. This helper extracts those safely.
 */
export function buildHumanReviewSlackNotification(
  agencyResult: AgencyResult
): NotificationRequest | null {
  const raw = toRecord(agencyResult);
  if (!raw || raw.needsHumanReview !== true) {
    return null;
  }

  const recipient =
    process.env.MARKETER_SLACK_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#marketing-alerts";

  const summary = String(agencyResult.summary ?? "Human review requested");
  const issues = readIssues(raw.issues);
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
  const hasSlack = notifications.some((n) => n.channel === "slack");
  if (hasSlack) return notifications;

  const fallback = buildHumanReviewSlackNotification(agencyResult);
  if (!fallback) return notifications;

  return [...notifications, fallback];
}
