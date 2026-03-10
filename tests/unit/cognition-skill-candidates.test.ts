import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import { CognitionAgent } from "../../src/agents/cognition-agent.js";
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

describe.sequential("CognitionAgent skill candidate injection", () => {
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

  it("injects persisted skill candidates into system prompt", () => {
    skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly API usage reporting workflow.",
      suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
      triggerPatterns: ["monthly api usage", "api calculations this month"],
      confidence: "high",
      requiresApproval: false,
    });

    const agent = new CognitionAgent();
    const context = buildExecutionContext("cognition-skill-candidates-test");
    const prompt = agent.buildSystemPrompt(context);

    expect(prompt).toContain("Skill Candidates (Persisted from Agency)");
    expect(prompt).toContain("mapp-monthly-analysis-usage");
    expect(prompt).toContain('add a "skill-creator" subtask first');
    expect(prompt).toContain("no human approval");
  });
});
