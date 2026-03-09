import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildHumanReviewSlackNotification,
  buildMonitoringSlackNotification,
  ensureHumanReviewSlackNotification,
  ensureMonitoringSlackNotification,
} from "../../src/trigger/deliver-notifications.js";
import type { AgencyResult, NotificationRequest } from "../../src/core/types.js";

function withAgencyExtras(data: {
  summary: string;
  needsHumanReview?: boolean;
  issues?: string[];
  failedSubtask?: boolean;
}): AgencyResult {
  return {
    results: data.failedSubtask
      ? [
          {
            subtaskId: "task-1",
            agentId: "api-fetcher",
            result: {
              success: false,
              output: "401 unauthorized",
              modelUsed: "api-fetcher (no model)",
            },
          },
        ]
      : [],
    summary: data.summary,
    ...(data.needsHumanReview !== undefined
      ? { needsHumanReview: data.needsHumanReview }
      : {}),
    ...(data.issues ? { issues: data.issues } : {}),
  } as AgencyResult;
}

describe("deliver human-review notification fallback", () => {
  const originalHitl = process.env.SLACK_HITL_CHANNEL;
  const originalSlack = process.env.SLACK_DEFAULT_CHANNEL;
  const originalMarketer = process.env.MARKETER_SLACK_CHANNEL;
  const originalMonitoring = process.env.SLACK_MONITORING_CHANNEL;

  beforeEach(() => {
    process.env.SLACK_HITL_CHANNEL = "#brand-cp-hitl";
    delete process.env.SLACK_DEFAULT_CHANNEL;
    process.env.SLACK_MONITORING_CHANNEL = "#monitoring-alerts";
    delete process.env.MARKETER_SLACK_CHANNEL;
  });

  afterEach(() => {
    process.env.SLACK_HITL_CHANNEL = originalHitl;
    process.env.SLACK_DEFAULT_CHANNEL = originalSlack;
    process.env.MARKETER_SLACK_CHANNEL = originalMarketer;
    process.env.SLACK_MONITORING_CHANNEL = originalMonitoring;
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
    expect(notification?.recipient).toBe("#brand-cp-hitl");
    expect(notification?.priority).toBe("warning");
  });

  it("uses SLACK_HITL_CHANNEL for human review even if MARKETER_SLACK_CHANNEL is set", () => {
    process.env.SLACK_HITL_CHANNEL = "#default-review";
    process.env.MARKETER_SLACK_CHANNEL = "#marketer-thread";

    const agency = withAgencyExtras({
      summary: "Needs approval",
      needsHumanReview: true,
    });

    const notification = buildHumanReviewSlackNotification(agency);
    expect(notification?.recipient).toBe("#default-review");
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
        recipient: "#brand-cp-hitl",
        subject: "Existing",
        body: "Already present",
        priority: "info",
      },
    ];

    const notifications = ensureHumanReviewSlackNotification(agency, existing);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].subject).toBe("Existing");
  });

  it("builds monitoring notification when explicit issues exist", () => {
    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      issues: ["Custom metric label is missing"],
    });

    const notification = buildMonitoringSlackNotification(agency);
    expect(notification).not.toBeNull();
    expect(notification?.recipient).toBe("#monitoring-alerts");
    expect(notification?.subject).toBe("Pipeline Monitoring Alert");
  });

  it("builds monitoring notification when a subtask fails", () => {
    const agency = withAgencyExtras({
      summary: "Completed with one failed subtask",
      failedSubtask: true,
    });

    const notification = buildMonitoringSlackNotification(agency);
    expect(notification).not.toBeNull();
    expect(notification?.body).toMatch(/failed/i);
  });

  it("appends monitoring fallback slack notification if none exists", () => {
    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      issues: ["Missing baseline for segment A"],
    });

    const notifications = ensureMonitoringSlackNotification(agency, []);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipient).toBe("#monitoring-alerts");
  });

  it("falls back monitoring recipient to SLACK_HITL_CHANNEL when monitoring channel is missing", () => {
    delete process.env.SLACK_MONITORING_CHANNEL;
    process.env.SLACK_HITL_CHANNEL = "#default-alerts";

    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      issues: ["One warning"],
    });

    const notification = buildMonitoringSlackNotification(agency);
    expect(notification?.recipient).toBe("#default-alerts");
  });

  it("does not build monitoring notification when there are no issues and no failed subtasks", () => {
    const agency = withAgencyExtras({
      summary: "Completed cleanly",
      issues: [],
      failedSubtask: false,
    });

    expect(buildMonitoringSlackNotification(agency)).toBeNull();
  });

  it("does not duplicate monitoring notification when one already exists", () => {
    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      issues: ["Issue A"],
    });

    const existing: NotificationRequest[] = [
      {
        channel: "slack",
        recipient: "#monitoring-alerts",
        subject: "Existing monitor alert",
        body: "Existing body",
        priority: "warning",
      },
    ];

    const notifications = ensureMonitoringSlackNotification(agency, existing);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].subject).toBe("Existing monitor alert");
  });
});
