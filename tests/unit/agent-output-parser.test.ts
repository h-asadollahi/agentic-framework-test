import { describe, it, expect } from "vitest";
import { parseAgentJson } from "../../src/trigger/agent-output-parser.js";

describe("agent output parser", () => {
  it("parses plain JSON object", () => {
    const parsed = parseAgentJson<{ ok: boolean }>('{"ok":true}');
    expect(parsed).toEqual({ ok: true });
  });

  it("parses fenced JSON object", () => {
    const parsed = parseAgentJson<{ summary: string }>([
      "```json",
      '{ "summary": "done" }',
      "```",
    ].join("\n"));
    expect(parsed).toEqual({ summary: "done" });
  });

  it("parses JSON object embedded after explanatory text", () => {
    const parsed = parseAgentJson<{ needsHumanReview: boolean; issues: string[] }>(
      'I analyzed the plan.\n{"needsHumanReview":true,"issues":["parser fallback detected"]}'
    );
    expect(parsed).toEqual({
      needsHumanReview: true,
      issues: ["parser fallback detected"],
    });
  });

  it("returns null for non-JSON output", () => {
    const parsed = parseAgentJson("Summary only without machine-readable structure.");
    expect(parsed).toBeNull();
  });
});
