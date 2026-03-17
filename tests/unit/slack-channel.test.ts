import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationRequest } from "../../src/core/types.js";
import { learnedRoutesStore } from "../../src/routing/learned-routes-store.js";

const postMessageMock = vi.fn();

vi.mock("@slack/web-api", () => ({
  WebClient: class MockWebClient {
    chat = {
      postMessage: postMessageMock,
    };
  },
}));

describe("slack channel admin audit", () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;
  const originalAdminChannel = process.env.SLACK_ADMIN_HITL_CHANNEL;

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = "test-slack-token";
    process.env.SLACK_ADMIN_HITL_CHANNEL = "brand-cp-admin-hitl";
    postMessageMock.mockReset();
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = originalToken;
    process.env.SLACK_ADMIN_HITL_CHANNEL = originalAdminChannel;
    vi.restoreAllMocks();
  });

  it("records direct Slack notifications in the admin audit store", async () => {
    postMessageMock.mockResolvedValue({
      ok: true,
      ts: "1710680923.000100",
    });

    const loadSpy = vi
      .spyOn(learnedRoutesStore, "load")
      .mockResolvedValue(undefined);
    const upsertSpy = vi
      .spyOn(learnedRoutesStore, "upsertSlackHitlThreadForAdmin")
      .mockResolvedValue(undefined);

    const { SlackChannel } = await import("../../src/channels/slack-channel.js");
    const channel = new SlackChannel();

    const request: NotificationRequest = {
      channel: "slack",
      recipient: "brand-cp-admin-hitl",
      subject: "Human review required: route-011 intake failure",
      body: "Needs human review: route-011 failed twice; hold the send and attach intake outputs.",
      priority: "warning",
      metadata: {
        source: "deliver-human-review-fallback",
      },
    };

    const result = await channel.send(request);

    expect(result).toEqual({
      success: true,
      messageId: "1710680923.000100",
    });
    expect(postMessageMock).toHaveBeenCalledWith({
      channel: "brand-cp-admin-hitl",
      text:
        "*Human review required: route-011 intake failure*\n\nNeeds human review: route-011 failed twice; hold the send and attach intake outputs.",
      mrkdwn: true,
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "notification",
        channel: "brand-cp-admin-hitl",
        messageTs: "1710680923.000100",
        threadTs: "1710680923.000100",
        status: "sent",
        taskDescription: "Human review required: route-011 intake failure",
        reason:
          "Needs human review: route-011 failed twice; hold the send and attach intake outputs.",
        severity: "warning",
        metadata: expect.objectContaining({
          source: "deliver-human-review-fallback",
          priority: "warning",
          subject: "Human review required: route-011 intake failure",
        }),
      })
    );
  });
});
