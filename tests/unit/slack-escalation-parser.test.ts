import { describe, expect, it } from "vitest";
import { parseReplyText } from "../../src/escalation/slack-escalation.js";

describe("slack escalation parser", () => {
  it("parses approval replies", () => {
    expect(parseReplyText("approved, go ahead")).toEqual({
      approved: true,
      decision: 'Approved (reply: "approved, go ahead")',
      decidedBy: "",
    });
  });

  it("parses dismissal replies before generic rejection keywords", () => {
    expect(parseReplyText("No action needed, false alarm")).toEqual({
      approved: false,
      decision: 'Dismissed as false alarm (reply: "No action needed, false alarm")',
      decidedBy: "",
      dismissed: true,
    });
  });

  it("parses explicit rejection replies", () => {
    expect(parseReplyText("reject this")).toEqual({
      approved: false,
      decision: 'Rejected (reply: "reject this")',
      decidedBy: "",
    });
  });
});
