import { describe, expect, it } from "vitest";
import { parseAgencySkillSuggestions } from "../../src/trigger/agency-skill-suggestions.js";

describe("parseAgencySkillSuggestions", () => {
  it("parses valid structured skill suggestions", () => {
    const parsed = parseAgencySkillSuggestions({
      summary: "Done",
      skillSuggestions: [
        {
          capability: "mapp-monthly-analysis-usage",
          description: "Automate monthly analysis usage fetch and summary.",
          suggestedSkillFile: "skills/mapp-monthly-analysis-usage.md",
          triggerPatterns: ["monthly api usage", "api calculations this month"],
          confidence: "high",
          requiresApproval: true,
          sourceSubtaskId: "task-1",
        },
      ],
    });

    expect(parsed.issue).toBeUndefined();
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0].capability).toBe("mapp-monthly-analysis-usage");
    expect(parsed.suggestions[0].confidence).toBe("high");
  });

  it("returns issue for malformed suggestions payload", () => {
    const parsed = parseAgencySkillSuggestions({
      skillSuggestions: [{ capability: "broken" }],
    });

    expect(parsed.suggestions).toEqual([]);
    expect(parsed.issue).toContain("invalid skillSuggestions format");
  });

  it("returns empty list when suggestions are absent", () => {
    const parsed = parseAgencySkillSuggestions({ summary: "no suggestions" });
    expect(parsed.suggestions).toEqual([]);
    expect(parsed.issue).toBeUndefined();
  });
});
