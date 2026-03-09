import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildHumanReviewSlackNotification,
  ensureHumanReviewSlackNotification,
} from "../../src/trigger/deliver-notifications.js";
import type { AgencyResult, NotificationRequest } from "../../src/core/types.js";

function withAgencyExtras(data: {
  summary: string;
  needsHumanReview?: boolean;
  issues?: string[];
}): AgencyResult {
  return {
    results: [],
    summary: data.summary,
    ...(data.needsHumanReview !== undefined
      ? { needsHumanReview: data.needsHumanReview }
      : {}),
    ...(data.issues ? { issues: data.issues } : {}),
  } as AgencyResult;
}

describe("deliver human-review notification fallback", () => {
  const originalSlack = process.env.SLACK_DEFAULT_CHANNEL;
  const originalMarketer = process.env.MARKETER_SLACK_CHANNEL;

  beforeEach(() => {
    process.env.SLACK_DEFAULT_CHANNEL = "#marketing-alerts";
    delete process.env.MARKETER_SLACK_CHANNEL;
  });

  afterEach(() => {
    process.env.SLACK_DEFAULT_CHANNEL = originalSlack;
    process.env.MARKETER_SLACK_CHANNEL = originalMarketer;
  });

  it("builds a slack notification when needsHumanReview is true", () => {
    const agency = withAgencyExtras({
      summary: "Analysis completed with unresolved anomalies",
      needsHumanReview: true,
      issues: ["Missing baseline for segment A"],
    });

    const notification = buildHumanReviewSlackNotification(agency);
    expect(notification).not.toBeNull();
    expect(notification?.channel).toBe("slack");
    expect(notification?.recipient).toBe("#marketing-alerts");
    expect(notification?.priority).toBe("warning");
  });

  it("does not build notification when needsHumanReview is false", () => {
    const agency = withAgencyExtras({
      summary: "All good",
      needsHumanReview: false,
    });

    expect(buildHumanReviewSlackNotification(agency)).toBeNull();
  });

  it("appends fallback slack notification if none exists", () => {
    const agency = withAgencyExtras({
      summary: "Needs review",
      needsHumanReview: true,
    });

    const notifications = ensureHumanReviewSlackNotification(agency, []);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].channel).toBe("slack");
  });

  it("does not duplicate when slack notification already exists", () => {
    const agency = withAgencyExtras({
      summary: "Needs review",
      needsHumanReview: true,
    });

    const existing: NotificationRequest[] = [
      {
        channel: "slack",
        recipient: "#ops",
        subject: "Existing",
        body: "Already present",
        priority: "info",
      },
    ];

    const notifications = ensureHumanReviewSlackNotification(agency, existing);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].subject).toBe("Existing");
  });
});
