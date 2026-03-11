import {
  afterEach,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { buildExecutionContext } from "../../src/core/context.js";
import {
  applyAutonomousSkillCreation,
  preloadCognitionStores,
} from "../../src/trigger/think.js";
import {
  preloadExecutionStores,
} from "../../src/trigger/execute.js";
import {
  filterSkillSuggestionsForCognitionContext,
  persistAndMaterializeSkillSuggestions,
} from "../../src/trigger/skill-learning.js";
import { materializeUniversalSkill } from "../../src/trigger/universal-skill-creator.js";
import { learnedRoutesStore } from "../../src/routing/learned-routes-store.js";
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("annotates materialized synthesis subtasks with learned-skill metadata", () => {
    const skillFile = "skills/learned/cohort-quarterly-kpi-rollup.test.md";
    cleanupSkillFile(skillFile);
    writeFileSync(
      resolve(process.cwd(), skillFile),
      "# test materialized skill\n",
      "utf-8"
    );

    skillCandidatesStore.upsertCandidate({
      capability: "cohort-quarterly-kpi-rollup",
      description: "Consolidate quarterly cohort KPI pulls into one narrative.",
      suggestedSkillFile: skillFile,
      triggerPatterns: [
        "vip cohort performance this quarter",
        "quarterly cohort summary",
      ],
      confidence: "high",
      requiresApproval: false,
      source: "autonomous",
    });

    const basePlan: CognitionResult = {
      subtasks: [
        {
          id: "task-1",
          agentId: "cohort-monitor",
          description: "Fetch VIP retention for this quarter",
          input: { metric: "retention", cohortId: "vip", timeRange: "90d" },
          dependencies: [],
          priority: "high",
        },
        {
          id: "task-2",
          agentId: "general",
          description:
            "Consolidate the KPI pulls into a single quarter narrative with actions",
          input: {},
          dependencies: ["task-1"],
          priority: "medium",
        },
      ],
      reasoning: "Quarterly cohort workflow.",
      plan: "Run KPI pulls and consolidate output.",
      rejected: false,
      rejectionReason: undefined,
    };

    const updated = applyAutonomousSkillCreation(
      basePlan,
      "How is our VIP cohort performing this quarter?"
    );

    const synthesisTask = updated.subtasks.find((task) => task.id === "task-2");
    expect(synthesisTask).toBeDefined();
    expect(synthesisTask?.input.useMaterializedSkill).toBe(true);
    expect(synthesisTask?.input.candidateId).toBe("skill-001");
    expect(synthesisTask?.input.suggestedSkillFile).toBe(skillFile);
    expect(updated.subtasks.some((task) => task.agentId === "skill-creator")).toBe(
      false
    );
    expect(updated.reasoning).toContain("Autonomous skill reuse");

    cleanupSkillFile(skillFile);
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

  it("preloads DB-backed route store before skill candidates for cognition", async () => {
    const callOrder: string[] = [];
    const routeLoadSpy = vi
      .spyOn(learnedRoutesStore, "load")
      .mockImplementation(async () => {
        callOrder.push("routes");
      });
    const candidateLoadSpy = vi
      .spyOn(skillCandidatesStore, "load")
      .mockImplementation(() => {
        callOrder.push("skills");
      });

    await preloadCognitionStores();

    expect(routeLoadSpy).toHaveBeenCalledOnce();
    expect(candidateLoadSpy).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["routes", "skills"]);
  });

  it("preloads DB-backed route store before skill candidates for execute", async () => {
    const callOrder: string[] = [];
    const routeLoadSpy = vi
      .spyOn(learnedRoutesStore, "load")
      .mockImplementation(async () => {
        callOrder.push("routes");
      });
    const candidateLoadSpy = vi
      .spyOn(skillCandidatesStore, "load")
      .mockImplementation(() => {
        callOrder.push("skills");
      });

    await preloadExecutionStores();

    expect(routeLoadSpy).toHaveBeenCalledOnce();
    expect(candidateLoadSpy).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["routes", "skills"]);
  });

  it("drops low-relevance skill suggestions against cognition context", () => {
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
      reasoning: "Monthly Mapp API usage request.",
      plan: "Fetch monthly API usage and summarize.",
      rejected: false,
      rejectionReason: undefined,
    };

    const suggestions: SkillSuggestion[] = [
      {
        capability: "mapp-monthly-analysis-usage",
        description: "Summarize monthly API usage in Mapp.",
        suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
        triggerPatterns: ["how many api calculations have i used this month"],
        confidence: "high",
        requiresApproval: false,
      },
      {
        capability: "initialize-learned-routes-store",
        description: "Initialize learnedRoutesStore load lifecycle in startup.",
        suggestedSkillFile: "skills/learned/initialize-learned-routes-store.md",
        triggerPatterns: ["learnedRoutesStore.load must be awaited"],
        confidence: "medium",
        requiresApproval: false,
      },
    ];

    const filtered = filterSkillSuggestionsForCognitionContext(
      suggestions,
      cognitionResult
    );

    expect(filtered.suggestions).toHaveLength(1);
    expect(filtered.suggestions[0].capability).toBe("mapp-monthly-analysis-usage");
    expect(filtered.droppedCount).toBe(1);
  });

  it("locks autonomous suggestion persistence to an existing matched skill", () => {
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
      reasoning: "Monthly Mapp API usage request.",
      plan: "How many API calculations have I used this month?",
      rejected: false,
      rejectionReason: undefined,
    };

    const suggestions: SkillSuggestion[] = [
      {
        capability: "mapp-monthly-analysis-usage",
        description: "Summarize monthly API usage in Mapp.",
        suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
        triggerPatterns: ["how many api calculations have i used this month"],
        confidence: "high",
        requiresApproval: false,
      },
      {
        capability: "mcp-usage-normalizer",
        description:
          "Normalize MCP usage payloads into a standard schema for summarization.",
        suggestedSkillFile: "skills/learned/mcp-usage-normalizer.md",
        triggerPatterns: ["normalize mcp usage", "summarize api quota"],
        confidence: "high",
        requiresApproval: false,
      },
    ];

    const filtered = filterSkillSuggestionsForCognitionContext(
      suggestions,
      cognitionResult,
      {
        lockedCapability: "mapp-monthly-analysis-usage",
        lockedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
        maxSuggestions: 1,
      }
    );

    expect(filtered.suggestions).toHaveLength(1);
    expect(filtered.suggestions[0].capability).toBe("mapp-monthly-analysis-usage");
    expect(filtered.droppedCount).toBe(1);
  });

  it("caps autonomous persisted suggestions to a single highest-relevance item", () => {
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
      reasoning: "Monthly Mapp API usage request.",
      plan: "How many API calculations have I used this month?",
      rejected: false,
      rejectionReason: undefined,
    };

    const suggestions: SkillSuggestion[] = [
      {
        capability: "mapp-monthly-analysis-usage",
        description: "Summarize monthly API usage in Mapp.",
        suggestedSkillFile: "skills/learned/mapp-monthly-analysis-usage.md",
        triggerPatterns: ["how many api calculations have i used this month"],
        confidence: "high",
        requiresApproval: false,
      },
      {
        capability: "monthly-api-usage-summarizer",
        description: "Summarize API calculations used this month.",
        suggestedSkillFile: "skills/learned/monthly-api-usage-summarizer.md",
        triggerPatterns: ["how many api calculations have i used this month"],
        confidence: "high",
        requiresApproval: false,
      },
    ];

    const filtered = filterSkillSuggestionsForCognitionContext(
      suggestions,
      cognitionResult,
      { maxSuggestions: 1 }
    );

    expect(filtered.suggestions).toHaveLength(1);
    expect(filtered.droppedCount).toBe(1);
  });
});
