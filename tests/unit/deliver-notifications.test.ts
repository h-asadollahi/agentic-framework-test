import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildMarketerHumanReviewSlackNotification,
  buildMarketerMonitoringSlackNotification,
  buildHumanReviewSlackNotification,
  buildMonitoringSlackNotification,
  ensureMarketerHumanReviewSlackNotification,
  ensureMarketerMonitoringSlackNotification,
  ensureHumanReviewSlackNotification,
  ensureMonitoringSlackNotification,
  normalizeSlackNotificationRecipients,
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
  const originalAdminHitl = process.env.SLACK_ADMIN_HITL_CHANNEL;
  const originalMarketersHitl = process.env.SLACK_MARKETERS_HITL_CHANNEL;
  const originalSlack = process.env.SLACK_DEFAULT_CHANNEL;
  const originalAdminMonitoring = process.env.SLACK_ADMIN_MONITORING_CHANNEL;
  const originalMarketersMonitoring = process.env.SLACK_MARKETERS_MONITORING_CHANNEL;

  beforeEach(() => {
    process.env.SLACK_ADMIN_HITL_CHANNEL = "#admin-hitl";
    process.env.SLACK_MARKETERS_HITL_CHANNEL = "#marketers-hitl";
    delete process.env.SLACK_DEFAULT_CHANNEL;
    process.env.SLACK_ADMIN_MONITORING_CHANNEL = "#admin-monitoring";
    process.env.SLACK_MARKETERS_MONITORING_CHANNEL = "#marketer-monitoring";
  });

  afterEach(() => {
    process.env.SLACK_ADMIN_HITL_CHANNEL = originalAdminHitl;
    process.env.SLACK_MARKETERS_HITL_CHANNEL = originalMarketersHitl;
    process.env.SLACK_DEFAULT_CHANNEL = originalSlack;
    process.env.SLACK_ADMIN_MONITORING_CHANNEL = originalAdminMonitoring;
    process.env.SLACK_MARKETERS_MONITORING_CHANNEL = originalMarketersMonitoring;
  });

  it("builds a slack notification when needsHumanReview is true", () => {
    const agency = withAgencyExtras({
      summary: "Analysis completed with unresolved anomalies",
      needsHumanReview: true,
      issues: ["Critical failure: auth error in downstream system"],
    });

    const notification = buildHumanReviewSlackNotification(agency);
    expect(notification).not.toBeNull();
    expect(notification?.channel).toBe("slack");
    expect(notification?.recipient).toBe("#admin-hitl");
    expect(notification?.priority).toBe("warning");
  });

  it("uses SLACK_ADMIN_HITL_CHANNEL for admin human review", () => {
    process.env.SLACK_ADMIN_HITL_CHANNEL = "#default-review";

    const agency = withAgencyExtras({
      summary: "Needs approval",
      needsHumanReview: true,
      failedSubtask: true,
    });

    const notification = buildHumanReviewSlackNotification(agency);
    expect(notification?.recipient).toBe("#default-review");
  });

  it("routes non-admin human review to SLACK_MARKETERS_HITL_CHANNEL", () => {
    const agency = withAgencyExtras({
      summary: "Needs marketer validation",
      needsHumanReview: true,
      issues: ["Copy tone should be reviewed by campaign owner"],
    });

    const notification = buildMarketerHumanReviewSlackNotification(agency);
    expect(notification).not.toBeNull();
    expect(notification?.recipient).toBe("#marketers-hitl");
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
      failedSubtask: true,
    });

    const notifications = ensureHumanReviewSlackNotification(agency, []);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].channel).toBe("slack");
  });

  it("appends marketer human-review fallback if none exists", () => {
    const agency = withAgencyExtras({
      summary: "Needs marketer review",
      needsHumanReview: true,
      issues: ["Campaign wording needs approval"],
    });

    const notifications = ensureMarketerHumanReviewSlackNotification(agency, []);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipient).toBe("#marketers-hitl");
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

    const notification = buildMarketerMonitoringSlackNotification(agency);
    expect(notification).not.toBeNull();
    expect(notification?.recipient).toBe("#marketer-monitoring");
    expect(notification?.subject).toBe("Marketer Monitoring Alert");
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

    const notifications = ensureMarketerMonitoringSlackNotification(agency, []);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipient).toBe("#marketer-monitoring");
  });

  it("falls back marketer monitoring recipient to admin monitoring when marketer channel is missing", () => {
    delete process.env.SLACK_MARKETERS_MONITORING_CHANNEL;
    process.env.SLACK_ADMIN_MONITORING_CHANNEL = "#default-alerts";

    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      issues: ["One warning"],
    });

    const notification = buildMarketerMonitoringSlackNotification(agency);
    expect(notification?.recipient).toBe("#default-alerts");
  });

  it("falls back admin monitoring recipient to SLACK_ADMIN_HITL_CHANNEL when monitoring channel is missing", () => {
    delete process.env.SLACK_ADMIN_MONITORING_CHANNEL;
    process.env.SLACK_ADMIN_HITL_CHANNEL = "#default-alerts";

    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      failedSubtask: true,
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
        recipient: "#admin-monitoring",
        subject: "Existing monitor alert",
        body: "Existing body",
        priority: "warning",
      },
    ];

    const notifications = ensureMonitoringSlackNotification(agency, existing);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].subject).toBe("Existing monitor alert");
  });

  it("does not escalate admin HITL for non-critical needsHumanReview without failures", () => {
    const agency = withAgencyExtras({
      summary: "Warnings only",
      needsHumanReview: true,
      issues: ["Description could be clearer"],
    });

    expect(buildHumanReviewSlackNotification(agency)).toBeNull();
  });

  it("normalizes interface monitoring notification to marketer channel for non-failure issues", () => {
    const agency = withAgencyExtras({
      summary: "Completed with warnings",
      issues: ["Minor data quality caveat"],
    });
    const normalized = normalizeSlackNotificationRecipients(agency, [
      {
        channel: "slack",
        recipient: "#wrong-channel",
        subject: "Pipeline Monitoring Alert",
        body: "Issues:\n- Minor data quality caveat",
        priority: "warning",
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].recipient).toBe("#marketer-monitoring");
  });

  it("normalizes interface monitoring notification to admin channel for failed subtasks", () => {
    const agency = withAgencyExtras({
      summary: "Completed with one failed subtask",
      failedSubtask: true,
      issues: ["Minor caveat"],
    });
    const normalized = normalizeSlackNotificationRecipients(agency, [
      {
        channel: "slack",
        recipient: "#wrong-channel",
        subject: "Pipeline Monitoring Alert",
        body: "Issues:\n- subtask failed",
        priority: "warning",
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].recipient).toBe("#admin-monitoring");
  });

  it("normalizes technical alert subject to admin monitoring channel on failures", () => {
    const agency = withAgencyExtras({
      summary: "MCP technical issue",
      failedSubtask: true,
    });
    const normalized = normalizeSlackNotificationRecipients(agency, [
      {
        channel: "slack",
        recipient: "#somewhere",
        subject: "Technical Alert: MCP Server Connectivity Issue",
        body: "Tool unavailable; route non-functional",
        priority: "high",
      },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].recipient).toBe("#admin-monitoring");
  });

  it("normalizes non-admin human review notification to marketer HITL channel", () => {
    const agency = withAgencyExtras({
      summary: "Needs marketer review",
      needsHumanReview: true,
      issues: ["Minor style review needed"],
    });
    const normalized = normalizeSlackNotificationRecipients(agency, [
      {
        channel: "slack",
        recipient: "#somewhere",
        subject: "Human Review Required",
        body: "Please review copy tone",
        priority: "warning",
      },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].recipient).toBe("#marketers-hitl");
  });
});
