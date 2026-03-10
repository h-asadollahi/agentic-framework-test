import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentResult, ExecutionContext, SubTask } from "../core/types.js";

const DEFAULT_SKILL_PATH = resolve(
  process.cwd(),
  "skills/universal-agent-skill-creator.md"
);

const SKILL_CREATION_KEYWORDS = [
  "create skill",
  "build skill",
  "new skill",
  "agent skill",
  "skill for",
  "reusable skill",
  "teach the agent",
  "skill template",
  "skill file",
];

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function extractTopHeadings(skillText: string): string[] {
  return skillText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, "").trim())
    .slice(0, 8);
}

export function isUniversalSkillCreationIntent(
  subtask: Pick<SubTask, "description" | "input">
): boolean {
  const description = normalizeText(subtask.description);
  const input = normalizeText(JSON.stringify(subtask.input ?? {}));
  const haystack = `${description}\n${input}`;
  return SKILL_CREATION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function loadUniversalSkillCreatorText(path = DEFAULT_SKILL_PATH): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function buildUniversalSkillGuidance(
  subtask: Pick<SubTask, "description" | "input">,
  context: ExecutionContext,
  skillText = loadUniversalSkillCreatorText()
): Record<string, unknown> {
  const headings = extractTopHeadings(skillText);
  const baseName = slugify(subtask.description || "new-agent-skill");

  return {
    workflow: "universal-agent-skill-creator",
    request: subtask.description,
    destinationFolder: "skills",
    suggestedSkillFile: `skills/${baseName}.md`,
    requiredSections: [
      "Intent capture",
      "System prompt and guardrails",
      "Tool definitions",
      "Domain knowledge references",
      "Evaluation prompts",
      "Versioning and rollout notes",
    ],
    processStages:
      headings.length > 0
        ? headings
        : [
            "Phase 1: Capture Intent",
            "Phase 2: Write the Skill",
            "Phase 3: Define Tools",
          ],
    nextSteps: [
      "Define precise activation triggers and expected output format.",
      "Draft skill content using the universal skill creator structure.",
      "Add test prompts for success and failure cases.",
      "Save finalized skill under ./skills for future routing.",
    ],
    references: ["skills/universal-agent-skill-creator.md"],
    brandContext: {
      brandName: context.brandIdentity.name,
      tone: context.brandIdentity.voice.tone,
    },
  };
}

export function buildUniversalSkillCreatorAgentResult(
  subtask: Pick<SubTask, "description" | "input">,
  context: ExecutionContext
): AgentResult {
  const guidance = buildUniversalSkillGuidance(subtask, context);
  return {
    success: true,
    output: JSON.stringify(guidance),
    modelUsed: "universal-skill-creator",
  };
}
