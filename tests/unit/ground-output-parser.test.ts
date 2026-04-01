import { describe, expect, it } from "vitest";
import { buildExecutionContext } from "../../src/core/context.js";
import { buildGroundingResultFromOutput } from "../../src/trigger/ground.js";

describe("grounding output parsing", () => {
  it("parses plain JSON grounding output", async () => {
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
    });

    const { parsedJson, groundingResult } = buildGroundingResultFromOutput(
      output,
      context
    );

    expect(parsedJson).toBe(true);
    expect(groundingResult.brandIdentity.name).toBe("Acme Brand");
    expect(groundingResult.guardrails.neverDo).toEqual([
      "Do not misrepresent campaign KPIs",
    ]);
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
    expect(groundingResult.brandIdentity.name).toBe("Fenced Brand");
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
  });
});
