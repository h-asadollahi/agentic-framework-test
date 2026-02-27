import { describe, it, expect } from "vitest";
import { parseSoulFile, parseGuardrailsFile } from "../../src/core/context.js";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("parseSoulFile", () => {
  it("parses the project soul.md correctly", () => {
    const identity = parseSoulFile(resolve(PROJECT_ROOT, "soul.md"));

    expect(identity.name).toBeTruthy();
    expect(identity.name).not.toBe("Brand"); // should have a real name
    expect(identity.personality.length).toBeGreaterThan(0);
    expect(identity.values.length).toBeGreaterThan(0);
    expect(identity.voice.tone).toBeTruthy();
    expect(identity.guidelines).toContain("#"); // raw markdown
  });

  it("returns defaults for missing file", () => {
    const identity = parseSoulFile("/tmp/nonexistent-soul.md");

    expect(identity.name).toBe("Brand");
    expect(identity.personality).toEqual([]);
    expect(identity.voice.tone).toBe("professional");
  });
});

describe("parseGuardrailsFile", () => {
  it("parses the project guardrails.md correctly", () => {
    const constraints = parseGuardrailsFile(
      resolve(PROJECT_ROOT, "knowledge/guardrails.md")
    );

    expect(constraints.neverDo.length).toBeGreaterThan(0);
    expect(constraints.alwaysDo.length).toBeGreaterThan(0);
  });

  it("returns empty arrays for missing file", () => {
    const constraints = parseGuardrailsFile("/tmp/nonexistent-guardrails.md");

    expect(constraints.neverDo).toEqual([]);
    expect(constraints.alwaysDo).toEqual([]);
    expect(constraints.brandVoiceRules).toEqual([]);
    expect(constraints.contentPolicies).toEqual([]);
  });
});
