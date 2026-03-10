import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { skillCandidatesStore } from "../../src/routing/skill-candidates-store.js";

const candidatesFile = resolve(process.cwd(), "knowledge/skill-candidates.json");
const initialCandidatesFile =
  JSON.stringify(
    {
      version: "1.0.0",
      lastUpdated: "2026-03-10T00:00:00.000Z",
      candidates: [],
    },
    null,
    2
  ) + "\n";

let backupContent: string | null = null;
let backupExisted = false;

describe.sequential("skill-candidates store", () => {
  beforeAll(() => {
    backupExisted = existsSync(candidatesFile);
    backupContent = backupExisted ? readFileSync(candidatesFile, "utf-8") : null;
  });

  beforeEach(() => {
    writeFileSync(candidatesFile, initialCandidatesFile, "utf-8");
    skillCandidatesStore.load();
  });

  afterAll(() => {
    if (backupExisted && backupContent !== null) {
      writeFileSync(candidatesFile, backupContent, "utf-8");
      return;
    }
    writeFileSync(candidatesFile, initialCandidatesFile, "utf-8");
  });

  it("adds a new skill candidate", () => {
    const candidate = skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly analysis usage reporting.",
      suggestedSkillFile: "skills/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["monthly api usage"],
      confidence: "high",
      requiresApproval: true,
    });

    expect(candidate.id).toBe("skill-001");
    expect(skillCandidatesStore.count()).toBe(1);
    expect(skillCandidatesStore.getSummary()[0].capability).toBe(
      "mapp-monthly-analysis-usage"
    );
  });

  it("upserts by capability and merges trigger patterns", () => {
    skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly analysis usage reporting.",
      suggestedSkillFile: "skills/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["monthly api usage"],
      confidence: "medium",
      requiresApproval: true,
    });

    const updated = skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly API usage + summary insights.",
      suggestedSkillFile: "skills/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["api calculations this month"],
      confidence: "high",
      requiresApproval: true,
    });

    expect(skillCandidatesStore.count()).toBe(1);
    expect(updated.confidence).toBe("high");
    expect(updated.triggerPatterns).toContain("monthly api usage");
    expect(updated.triggerPatterns).toContain("api calculations this month");
  });
});
