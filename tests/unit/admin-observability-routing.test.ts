import { describe, expect, it } from "vitest";
import {
  buildDeterministicAdminObservabilityPlan,
  inferAdminTokenUsageMonitorRequest,
} from "../../src/trigger/admin-observability.js";
import { resolveAdminObservabilityFallback } from "../../src/trigger/execute.js";
import {
  createAdminRequestContext,
  createMarketerRequestContext,
} from "../../src/core/request-context.js";

describe("admin observability routing", () => {
  it("maps plural llms prompts to token usage monitoring for marketers", () => {
    const request = inferAdminTokenUsageMonitorRequest(
      "Give me the daily token usage across all the LLMs used for this project by marketers.",
      createAdminRequestContext({ brandId: "acme-marketing" })
    );

    expect(request).toEqual({
      audience: "marketer",
      brandId: "acme-marketing",
      days: 7,
      bucket: "day",
    });
  });

  it("respects admin and all-brands phrasing", () => {
    const request = inferAdminTokenUsageMonitorRequest(
      "Show me the token usage across all brands for admins in the last 30 days across OpenAI, Claude, and Gemini.",
      createAdminRequestContext({ brandId: "acme-marketing" })
    );

    expect(request).toEqual({
      audience: "admin",
      brandId: null,
      days: 30,
      bucket: "day",
    });
  });

  it("does not activate for marketer-scoped requests", () => {
    const request = inferAdminTokenUsageMonitorRequest(
      "Give me the daily token usage across all the LLMs used for this project by marketers.",
      createMarketerRequestContext("acme-marketing", "api")
    );

    expect(request).toBeNull();
  });

  it("builds cognition and execute fallbacks for admin token usage prompts", () => {
    const requestContext = createAdminRequestContext({ brandId: "acme-marketing" });
    const prompt =
      "Give me the daily token usage across all the LLMs used for this project by marketers.";

    const cognitionPlan = buildDeterministicAdminObservabilityPlan(
      prompt,
      requestContext
    );
    expect(cognitionPlan?.subtasks[0]).toMatchObject({
      agentId: "token-usage-monitor",
      input: {
        audience: "marketer",
        brandId: "acme-marketing",
      },
    });

    const executeFallback = resolveAdminObservabilityFallback(
      {
        agentId: "general",
        description: prompt,
        input: {},
      },
      requestContext
    );
    expect(executeFallback).toEqual({
      agentId: "token-usage-monitor",
      input: {
        audience: "marketer",
        brandId: "acme-marketing",
        days: 7,
        bucket: "day",
      },
    });
  });
});
