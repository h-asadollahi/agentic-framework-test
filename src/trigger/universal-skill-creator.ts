import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  join,
  normalize,
  resolve,
  sep,
} from "node:path";
import type {
  AgentResult,
  ExecutionContext,
  SkillSuggestion,
  SubTask,
} from "../core/types.js";

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

const AUTONOMOUS_SKILL_GENERATOR_MARKER = "generatedBy: autonomous-skill-loop";

type JsonRecord = Record<string, unknown>;

export type SkillMaterializationRequest = {
  capability?: string;
  description: string;
  suggestedSkillFile?: string;
  triggerPatterns?: string[];
  candidateId?: string;
  source?: "agency" | "manual" | "autonomous";
};

export type SkillMaterializationResult = {
  success: boolean;
  action: "created" | "updated" | "unchanged" | "skipped-manual" | "failed";
  skillFile: string;
  absolutePath: string;
  bytesWritten: number;
  reason?: string;
};

function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    const hasPackageJson = existsSync(join(current, "package.json"));
    const hasKnowledgeDir = existsSync(join(current, "knowledge"));
    if (hasPackageJson && hasKnowledgeDir) return current;

    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

function resolveProjectRoot(): string {
  return (
    findProjectRoot(process.cwd()) ??
    findProjectRoot(import.meta.dirname) ??
    resolve(import.meta.dirname, "../..")
  );
}

const PROJECT_ROOT = resolveProjectRoot();
const LEARNED_SKILLS_RELATIVE_DIR = "skills/learned";
const LEARNED_SKILLS_DIR = resolve(PROJECT_ROOT, LEARNED_SKILLS_RELATIVE_DIR);
const DEFAULT_SKILL_PATH = resolve(
  PROJECT_ROOT,
  "skills/universal-agent-skill-creator.md"
);

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeTextLower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function toTitleCase(text: string): string {
  return text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractTopHeadings(skillText: string): string[] {
  return skillText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, "").trim())
    .slice(0, 8);
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function normalizeTriggerPatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20)
  )];
}

function sanitizeRelativeSkillFilePath(
  requestedPath: string | undefined,
  fallbackSlug: string
): { relativePath: string; absolutePath: string } {
  const fallbackFileName = `${fallbackSlug || "new-agent-skill"}.md`;
  const fallback = `${LEARNED_SKILLS_RELATIVE_DIR}/${fallbackFileName}`;
  const raw = normalizeText(requestedPath);

  let candidate = raw.length > 0 ? raw : fallback;
  candidate = candidate.replace(/\\/g, "/");

  if (candidate.startsWith("./")) {
    candidate = candidate.slice(2);
  }

  if (!candidate.toLowerCase().endsWith(".md")) {
    candidate = `${candidate}.md`;
  }

  if (candidate.startsWith("skills/")) {
    if (!candidate.startsWith(`${LEARNED_SKILLS_RELATIVE_DIR}/`)) {
      const fileName = candidate.split("/").pop() || fallbackFileName;
      candidate = `${LEARNED_SKILLS_RELATIVE_DIR}/${fileName}`;
    }
  } else {
    const fileName = candidate.split("/").pop() || fallbackFileName;
    candidate = `${LEARNED_SKILLS_RELATIVE_DIR}/${fileName}`;
  }

  candidate = normalize(candidate).replace(/\\/g, "/");

  const absoluteCandidate = resolve(PROJECT_ROOT, candidate);
  const learnedSkillsPrefix = `${LEARNED_SKILLS_DIR}${sep}`;

  if (!absoluteCandidate.startsWith(learnedSkillsPrefix)) {
    const absoluteFallback = resolve(PROJECT_ROOT, fallback);
    return { relativePath: fallback, absolutePath: absoluteFallback };
  }

  return {
    relativePath: candidate,
    absolutePath: absoluteCandidate,
  };
}

function buildSystemPromptTemplate(capability: string, description: string): string {
  const safeCapability = capability || "general-marketing-workflow";
  return `You are the ${safeCapability} specialist for ${"{{BRAND_NAME}}"}.

Mission:
- Execute the workflow: ${description}
- Keep outputs marketer-friendly and action-oriented.
- Escalate only hard failures; do not request human approval for routine execution.

Workflow rules:
1. Prefer deterministic routes/sub-agents already available in the system.
2. If multiple data sources exist, choose the one with higher confidence and better freshness.
3. Return concise markdown with summary, findings, and next steps.
4. Capture reusable learnings in structured form for future runs.`;
}

function buildSkillMarkdown(
  request: SkillMaterializationRequest,
  context: ExecutionContext,
  skillText: string,
  skillFile: string
): string {
  const capability =
    normalizeText(request.capability) || slugify(request.description) || "new-agent-skill";
  const capabilityTitle = toTitleCase(capability);
  const description =
    normalizeText(request.description) || "Reusable workflow skill.";
  const triggerPatterns =
    request.triggerPatterns && request.triggerPatterns.length > 0
      ? request.triggerPatterns
      : [description.toLowerCase()];

  const processStages = extractTopHeadings(skillText);
  const fallbackStages = [
    "Capture Intent",
    "Write the Skill",
    "Define Tools",
    "Test and Evaluate",
    "Iterate and Improve",
  ];

  const stages = processStages.length > 0 ? processStages : fallbackStages;

  return `---
name: ${capability}
description: ${description}
version: 1.0.0
${AUTONOMOUS_SKILL_GENERATOR_MARKER}
source: ${request.source ?? "autonomous"}
candidateId: ${request.candidateId ?? "n/a"}
skillFile: ${skillFile}
--- 

# ${capabilityTitle} Skill

Auto-generated using \`skills/universal-agent-skill-creator.md\` for autonomous self-improvement.

## Intent
${description}

## Activation Triggers
${triggerPatterns.map((pattern) => `- ${pattern}`).join("\n")}

## System Prompt
\`\`\`md
${buildSystemPromptTemplate(capability, description)}
\`\`\`

## Tool Strategy
- Prefer existing deterministic sub-agents/routes first.
- If route is API-based, keep execution deterministic and schema-safe.
- Preserve MCP-first behavior for MCP-native capabilities.

## Knowledge References
- knowledge/learned-routes.json
- knowledge/skill-candidates.json
- skills/universal-agent-skill-creator.md

## Evaluation Prompts
${triggerPatterns
  .slice(0, 5)
  .map((pattern) => `- ${pattern}`)
  .join("\n")}

## Lifecycle
- Current status: active
- Created for brand: ${context.brandIdentity.name}
- Re-run source process when workflow changes.

## Creation Process Stages
${stages.map((stage) => `- ${stage}`).join("\n")}
`;
}

export function isUniversalSkillCreationIntent(
  subtask: Pick<SubTask, "description" | "input">
): boolean {
  const description = normalizeTextLower(subtask.description);
  const input = normalizeTextLower(JSON.stringify(subtask.input ?? {}));
  const haystack = `${description}\n${input}`;
  return SKILL_CREATION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function loadUniversalSkillCreatorText(path = DEFAULT_SKILL_PATH): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function materializeUniversalSkill(
  request: SkillMaterializationRequest,
  context: ExecutionContext,
  skillText = loadUniversalSkillCreatorText()
): SkillMaterializationResult {
  const baseName = slugify(request.capability || request.description || "new-agent-skill");
  const resolvedPath = sanitizeRelativeSkillFilePath(
    request.suggestedSkillFile,
    baseName
  );

  const markdown = buildSkillMarkdown(
    {
      ...request,
      capability: request.capability || baseName,
    },
    context,
    skillText,
    resolvedPath.relativePath
  );

  try {
    mkdirSync(dirname(resolvedPath.absolutePath), { recursive: true });

    if (existsSync(resolvedPath.absolutePath)) {
      const current = readFileSync(resolvedPath.absolutePath, "utf-8");

      if (!current.includes(AUTONOMOUS_SKILL_GENERATOR_MARKER)) {
        return {
          success: true,
          action: "skipped-manual",
          skillFile: resolvedPath.relativePath,
          absolutePath: resolvedPath.absolutePath,
          bytesWritten: 0,
          reason:
            "Existing skill file appears manually maintained; skipped overwrite.",
        };
      }

      if (current === markdown) {
        return {
          success: true,
          action: "unchanged",
          skillFile: resolvedPath.relativePath,
          absolutePath: resolvedPath.absolutePath,
          bytesWritten: 0,
          reason: "Skill file already up to date.",
        };
      }

      writeFileSync(resolvedPath.absolutePath, markdown, "utf-8");
      return {
        success: true,
        action: "updated",
        skillFile: resolvedPath.relativePath,
        absolutePath: resolvedPath.absolutePath,
        bytesWritten: Buffer.byteLength(markdown, "utf-8"),
      };
    }

    writeFileSync(resolvedPath.absolutePath, markdown, "utf-8");
    return {
      success: true,
      action: "created",
      skillFile: resolvedPath.relativePath,
      absolutePath: resolvedPath.absolutePath,
      bytesWritten: Buffer.byteLength(markdown, "utf-8"),
    };
  } catch (error) {
    return {
      success: false,
      action: "failed",
      skillFile: resolvedPath.relativePath,
      absolutePath: resolvedPath.absolutePath,
      bytesWritten: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function materializeUniversalSkillFromSuggestion(
  suggestion: Pick<
    SkillSuggestion,
    "capability" | "description" | "suggestedSkillFile" | "triggerPatterns"
  >,
  context: ExecutionContext,
  source: SkillMaterializationRequest["source"] = "agency"
): SkillMaterializationResult {
  return materializeUniversalSkill(
    {
      capability: suggestion.capability,
      description: suggestion.description,
      suggestedSkillFile: suggestion.suggestedSkillFile,
      triggerPatterns: suggestion.triggerPatterns,
      source,
    },
    context
  );
}

export function buildUniversalSkillGuidance(
  subtask: Pick<SubTask, "description" | "input">,
  context: ExecutionContext,
  skillText = loadUniversalSkillCreatorText()
): Record<string, unknown> {
  const input = asRecord(subtask.input);
  const inputDescription = normalizeText(input.description);
  const inputCapability = normalizeText(input.capability);

  const requestDescription = inputDescription || normalizeText(subtask.description);
  const requestCapability =
    inputCapability || slugify(requestDescription || "new-agent-skill");

  const triggerPatterns = normalizeTriggerPatterns(input.triggerPatterns);

  const materialization = materializeUniversalSkill(
    {
      capability: requestCapability,
      description: requestDescription || "Reusable workflow skill.",
      suggestedSkillFile: normalizeText(input.suggestedSkillFile) || undefined,
      triggerPatterns,
      candidateId: normalizeText(input.candidateId) || undefined,
      source: "autonomous",
    },
    context,
    skillText
  );

  const headings = extractTopHeadings(skillText);
  const baseName = slugify(subtask.description || "new-agent-skill");

  return {
    workflow: "universal-agent-skill-creator",
    request: subtask.description,
    destinationFolder: LEARNED_SKILLS_RELATIVE_DIR,
    suggestedSkillFile:
      materialization.skillFile ||
      `${LEARNED_SKILLS_RELATIVE_DIR}/${baseName}.md`,
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
      "Use generated skill for matching future prompts without human review.",
      "Keep trigger patterns updated when new prompt variants appear.",
      "Run evaluation prompts to validate output quality.",
      "Store finalized learned skill under ./skills/learned for deterministic reuse.",
    ],
    references: ["skills/universal-agent-skill-creator.md"],
    materialization,
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
