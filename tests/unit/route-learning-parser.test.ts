import { describe, it, expect } from "vitest";
import {
  parseRouteInfoReply,
  parseRouteLearningDismissalReply,
} from "../../src/routing/route-learning-escalation.js";

describe("route-learning parser", () => {
  it("returns null when no url exists", () => {
    const parsed = parseRouteInfoReply("Method: GET\nHeaders: Authorization: Bearer abc");
    expect(parsed).toBeNull();
  });

  it("parses url-only reply with defaults", () => {
    const parsed = parseRouteInfoReply("https://api.example.com/v1/clv");

    expect(parsed).toEqual({
      url: "https://api.example.com/v1/clv",
      method: "GET",
      headers: {},
      queryParams: {},
    });
  });

  it("parses structured method, headers, and params", () => {
    const parsed = parseRouteInfoReply([
      "URL: https://api.example.com/v1/cohorts",
      "Method: POST",
      "Headers: Authorization: Bearer {{CLV_API_KEY}}",
      "Params: cohortId, dateRange=last_30_days",
    ].join("\n"));

    expect(parsed).toEqual({
      url: "https://api.example.com/v1/cohorts",
      method: "POST",
      headers: {
        Authorization: "Bearer {{CLV_API_KEY}}",
      },
      queryParams: {
        cohortId: "{{input.cohortId}}",
        dateRange: "last_30_days",
      },
    });
  });

  it("detects dismissal replies for false alarms", () => {
    const parsed = parseRouteLearningDismissalReply(
      "False alarm, ignore this one for now."
    );

    expect(parsed).toEqual({
      dismissed: true,
      decision: 'Dismissed as false alarm (reply: "False alarm, ignore this one for now.")',
    });
  });
});
