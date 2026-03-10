import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import { applyAutonomousSkillCreation } from "../../src/trigger/think.js";
import { persistAndMaterializeSkillSuggestions } from "../../src/trigger/execute.js";
import { materializeUniversalSkill } from "../../src/trigger/universal-skill-creator.js";
import { skillCandidatesStore } from "../../src/routing/skill-candidates-store.js";
import type { CognitionResult, SkillSuggestion } from "../../src/core/types.js";

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

function cleanupSkillFile(relativePath: string): void {
  const absolute = resolve(process.cwd(), relativePath);
  if (existsSync(absolute)) unlinkSync(absolute);
}

describe.sequential("autonomous skill loop", () => {
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

  it("materializes universal skill file and keeps it unchanged on second run", () => {
    const context = buildExecutionContext("autonomous-skill-materialize-test");
    const skillFile = "skills/learned/autonomous-skill-materialize-test.md";
    cleanupSkillFile(skillFile);

    const created = materializeUniversalSkill({
      capability: "autonomous-monthly-api-usage",
      description: "Automate monthly API usage checks and summary generation.",
      suggestedSkillFile: skillFile,
      triggerPatterns: ["monthly api usage", "api calculations this month"],
      source: "autonomous",
    }, context);

    expect(created.success).toBe(true);
    expect(created.action).toBe("created");
    expect(existsSync(resolve(process.cwd(), skillFile))).toBe(true);

    const unchanged = materializeUniversalSkill({
      capability: "autonomous-monthly-api-usage",
      description: "Automate monthly API usage checks and summary generation.",
      suggestedSkillFile: skillFile,
      triggerPatterns: ["monthly api usage", "api calculations this month"],
      source: "autonomous",
    }, context);

    expect(unchanged.success).toBe(true);
    expect(unchanged.action).toBe("unchanged");

    cleanupSkillFile(skillFile);
  });

  it("prepends a skill-creator task when matched candidate skill file is missing", () => {
    const skillFile = "skills/learned/autonomous-missing-skill-test.md";
    cleanupSkillFile(skillFile);

    skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly API usage workflow.",
      suggestedSkillFile: skillFile,
      triggerPatterns: ["monthly api usage", "api calculations this month"],
      confidence: "high",
      requiresApproval: false,
      source: "autonomous",
    });

    const basePlan: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "mcp-fetcher",
          description: "How many API calculations have I used this month?",
          input: { routeId: "route-007" },
          dependencies: [],
          priority: "high",
        },
      ],
      reasoning: "Matched monthly usage workflow.",
      plan: "Run monthly usage route.",
      rejected: false,
      rejectionReason: undefined,
    };

    const updated = applyAutonomousSkillCreation(
      basePlan,
      "How many API calculations have I used this month?"
    );

    expect(updated.subtasks[0].agentId).toBe("skill-creator");
    expect(updated.subtasks[0].input.candidateId).toBe("skill-001");
    expect(updated.subtasks[1].dependencies).toContain(updated.subtasks[0].id);
    expect(updated.reasoning).toContain("Autonomous self-learning");
  });

  it("persists and materializes skill suggestions without human-approval gating", () => {
    const context = buildExecutionContext("autonomous-skill-suggestion-test");
    const skillFile = "skills/learned/autonomous-suggestion-materialized.md";
    cleanupSkillFile(skillFile);

    const suggestions: SkillSuggestion[] = [
      {
        capability: "mapp-monthly-analysis-usage",
        description: "Automate monthly API usage retrieval and summary.",
        suggestedSkillFile: "skills/autonomous-suggestion-materialized.md",
        triggerPatterns: ["monthly api usage", "api calculations this month"],
        confidence: "high",
        requiresApproval: true,
        sourceSubtaskId: "task-1",
      },
    ];

    const result = persistAndMaterializeSkillSuggestions(suggestions, context);
    expect(result.materializations).toHaveLength(1);
    expect(result.materializations[0].success).toBe(true);
    expect(result.materializations[0].action).toBe("created");
    expect(result.issues).toEqual([]);

    const summary = skillCandidatesStore.getSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0].requiresApproval).toBe(false);
    expect(summary[0].materialized).toBe(true);
    expect(summary[0].suggestedSkillFile).toBe(skillFile);

    cleanupSkillFile(skillFile);
  });
});
