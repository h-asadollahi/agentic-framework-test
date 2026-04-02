import { describe, expect, it } from "vitest";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  buildDeterministicGroundingSummary,
  buildGroundingResultFromOutput,
  shouldUseDeterministicGrounding,
} from "../../src/trigger/ground.js";

describe("grounding output parsing", () => {
  it("keeps deterministic brand identity and guardrails authoritative even when JSON parses", async () => {
    const context = await buildExecutionContext("ground-plain-json");
    const output = JSON.stringify({
      brandIdentity: {
        ...context.brandIdentity,
        name: "Acme Brand",
      },
      guardrails: {
        ...context.guardrails,
        neverDo: ["Do not misrepresent campaign KPIs"],
      },
      summary: "Summarized active brand contract.",
    });

    const { parsedJson, groundingResult } = buildGroundingResultFromOutput(
      output,
      context
    );

    expect(parsedJson).toBe(true);
    expect(groundingResult.brandIdentity.name).toBe(context.brandIdentity.name);
    expect(groundingResult.guardrails).toEqual(context.guardrails);
    expect(groundingResult.summary).toBe("Summarized active brand contract.");
  });

  it("parses fenced JSON grounding output", async () => {
    const context = await buildExecutionContext("ground-fenced-json");
    const fenced = [
      "Grounding summary:",
      "```json",
      JSON.stringify({
        brandIdentity: {
          ...context.brandIdentity,
          name: "Fenced Brand",
        },
      }),
      "```",
    ].join("\n");

    const { parsedJson, groundingResult } = buildGroundingResultFromOutput(
      fenced,
      context
    );

    expect(parsedJson).toBe(true);
    expect(groundingResult.brandIdentity.name).toBe(context.brandIdentity.name);
    expect(groundingResult.guardrails).toEqual(context.guardrails);
  });

  it("falls back to context when output is non-JSON", async () => {
    const context = await buildExecutionContext("ground-fallback");
    const { parsedJson, groundingResult } = buildGroundingResultFromOutput(
      "Grounding complete. Proceeding with defaults.",
      context
    );

    expect(parsedJson).toBe(false);
    expect(groundingResult.brandIdentity).toEqual(context.brandIdentity);
    expect(groundingResult.guardrails).toEqual(context.guardrails);
    expect(groundingResult.summary).toBe(buildDeterministicGroundingSummary(context));
  });

  it("uses deterministic grounding for normal marketer requests", async () => {
    const context = await buildExecutionContext("ground-deterministic-default");

    expect(
      shouldUseDeterministicGrounding(
        "List all available dimensions and metrics in Mapp Intelligence",
        context
      )
    ).toBe(true);
  });

  it("keeps optional grounding narration for interpretation-like requests", async () => {
    const context = await buildExecutionContext("ground-interpretation");

    expect(
      shouldUseDeterministicGrounding(
        "Can we make an exception to the current brand rules for this request?",
        context
      )
    ).toBe(false);
  });
});
