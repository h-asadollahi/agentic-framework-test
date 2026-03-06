import { describe, it, expect } from "vitest";
import {
  buildMcpToolArgs,
  resolveMcpTemplateValue,
} from "../../src/trigger/sub-agents/plugins/mcp-fetcher.js";

describe("mcp-fetcher mapping helpers", () => {
  it("resolves exact input placeholders to original value types", () => {
    const result = resolveMcpTemplateValue("{{input.limit}}", { limit: 25 });
    expect(result).toBe(25);
  });

  it("resolves nested objects and arrays", () => {
    const result = resolveMcpTemplateValue(
      {
        query: "{{input.query}}",
        filters: [{ key: "segment", value: "{{input.segment}}" }],
      },
      { query: "vip", segment: "high-value" }
    );

    expect(result).toEqual({
      query: "vip",
      filters: [{ key: "segment", value: "high-value" }],
    });
  });

  it("merges defaults with runtime params and lets runtime override", () => {
    const args = buildMcpToolArgs(
      {
        period: "{{input.period}}",
        metric: "revenue",
      },
      {
        period: "30d",
        metric: "sessions",
        channel: "email",
      }
    );

    expect(args).toEqual({
      period: "30d",
      metric: "sessions",
      channel: "email",
    });
  });
});
