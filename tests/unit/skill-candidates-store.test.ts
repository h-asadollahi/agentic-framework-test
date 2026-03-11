import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
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
      suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
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

  it("normalizes autonomous skill paths into skills/learned", () => {
    const candidate = skillCandidatesStore.upsertCandidate({
      capability: "legacy-root-path-skill",
      description: "Legacy suggested path in skills root.",
      suggestedSkillFile: "skills/legacy-root-path-skill.md",
      triggerPatterns: ["legacy root path skill"],
      confidence: "medium",
      requiresApproval: false,
    });

    expect(candidate.suggestedSkillFile).toBe(
      "skills/learned/legacy-root-path-skill.md"
    );
  });

  it("upserts by capability and merges trigger patterns", () => {
    skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly analysis usage reporting.",
      suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["monthly api usage"],
      confidence: "medium",
      requiresApproval: true,
    });

    const updated = skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly API usage + summary insights.",
      suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["api calculations this month"],
      confidence: "high",
      requiresApproval: true,
    });

    expect(skillCandidatesStore.count()).toBe(1);
    expect(updated.confidence).toBe("high");
    expect(updated.triggerPatterns).toContain("monthly api usage");
    expect(updated.triggerPatterns).toContain("api calculations this month");
  });

  it("fuzzy-deduplicates semantically similar candidates", () => {
    const first = skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly analysis usage reporting.",
      suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
      triggerPatterns: [
        "how many api calculations have i used this month",
        "monthly api usage",
      ],
      confidence: "high",
      requiresApproval: false,
    });

    const second = skillCandidatesStore.upsertCandidate({
      capability: "monthly-api-usage-summarizer",
      description: "Summarize monthly API calculation usage for Mapp.",
      suggestedSkillFile: "skills/learned/monthly-api-usage-summarizer.md",
      triggerPatterns: [
        "how many api calculations have i used this month",
        "api calculations remaining this month",
      ],
      confidence: "medium",
      requiresApproval: false,
    });

    expect(skillCandidatesStore.count()).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.triggerPatterns).toContain(
      "api calculations remaining this month"
    );
  });

  it("finds best matching candidate by prompt text", () => {
    skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly analysis usage reporting.",
      suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["monthly api usage", "api calculations this month"],
      confidence: "high",
      requiresApproval: false,
    });

    skillCandidatesStore.upsertCandidate({
      capability: "generic-reporting-helper",
      description: "Generic report helper",
      suggestedSkillFile: "skills/learned/generic-reporting-helper.md",
      triggerPatterns: ["report", "analytics"],
      confidence: "low",
      requiresApproval: false,
    });

    const match = skillCandidatesStore.findBestMatchByPrompt(
      "How many API calculations have I used this month?"
    );

    expect(match?.capability).toBe("mapp-monthly-analysis-usage");
  });

  it("marks summary entries as materialized when skill file exists", () => {
    const skillFile = "skills/learned/skill-candidate-materialized-test.md";
    const absoluteSkillFile = resolve(process.cwd(), skillFile);
    mkdirSync(dirname(absoluteSkillFile), { recursive: true });
    writeFileSync(absoluteSkillFile, "# test\n", "utf-8");

    skillCandidatesStore.upsertCandidate({
      capability: "materialized-skill-test",
      description: "Materialized skill candidate test.",
      suggestedSkillFile: skillFile,
      triggerPatterns: ["materialized skill test"],
      confidence: "medium",
      requiresApproval: false,
    });

    const summary = skillCandidatesStore.getSummary();
    expect(summary[0].materialized).toBe(true);

    if (existsSync(absoluteSkillFile)) {
      unlinkSync(absoluteSkillFile);
    }
  });
});
