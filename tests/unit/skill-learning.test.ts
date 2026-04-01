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
import { prepareAutonomousSkillSuggestionsForPersistence } from "../../src/trigger/skill-learning.js";
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

describe.sequential("skill-learning helpers", () => {
  beforeAll(() => {
    backupExisted = existsSync(candidatesFile);
    backupContent = backupExisted ? readFileSync(candidatesFile, "utf-8") : null;
  });

  beforeEach(async () => {
    writeFileSync(candidatesFile, initialCandidatesFile, "utf-8");
    await skillCandidatesStore.load();
  });

  afterAll(() => {
    if (backupExisted && backupContent !== null) {
      writeFileSync(candidatesFile, backupContent, "utf-8");
      return;
    }
    writeFileSync(candidatesFile, initialCandidatesFile, "utf-8");
  });

  it("locks suggestions to existing materialized candidate and applies one-item cap", async () => {
    const skillFile = "skills/learned/mapp-monthly-analysis-usage.md";
    const absoluteSkillFile = resolve(process.cwd(), skillFile);
    mkdirSync(dirname(absoluteSkillFile), { recursive: true });
    writeFileSync(absoluteSkillFile, "# existing skill\n", "utf-8");

    const candidate = await skillCandidatesStore.upsertCandidate({
      capability: "mapp-monthly-analysis-usage",
      description: "Automate monthly usage retrieval and summary.",
      suggestedSkillFile: skillFile,
      triggerPatterns: ["how many api calculations have i used this month"],
      confidence: "high",
      requiresApproval: false,
      source: "autonomous",
    });

    const cognitionResult: CognitionResult = {
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
      reasoning: "Monthly usage request.",
      plan: "How many API calculations have I used this month?",
      rejected: false,
    };

    const suggestions: SkillSuggestion[] = [
      {
        capability: "mapp-monthly-analysis-usage",
        description: "Summarize monthly API usage in Mapp.",
        suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
        triggerPatterns: ["how many api calculations have i used this month"],
        confidence: "high",
      },
      {
        capability: "mcp-usage-normalizer",
        description: "Normalize MCP usage payloads to a standard schema.",
        suggestedSkillFile: "skills/learned/mcp-usage-normalizer.md",
        triggerPatterns: ["normalize mcp usage"],
        confidence: "high",
      },
    ];

    const prepared = prepareAutonomousSkillSuggestionsForPersistence(
      suggestions,
      cognitionResult,
      { maxSuggestions: 1 }
    );

    expect(prepared.suggestions).toHaveLength(1);
    expect(prepared.suggestions[0].capability).toBe("mapp-monthly-analysis-usage");
    expect(prepared.droppedCount).toBe(1);
    expect(prepared.lockedToCandidateId).toBe(candidate.id);

    if (existsSync(absoluteSkillFile)) {
      unlinkSync(absoluteSkillFile);
    }
  });
});
