import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentResult, ExecutionContext, SubTask } from "../core/types.js";

const DEFAULT_SKILL_PATH = resolve(process.cwd(), "skills/mcp-builder-SKILL.md");

const MCP_BUILDER_KEYWORDS = [
  "create mcp server",
  "build mcp server",
  "mcp server",
  "model context protocol server",
  "integrate api",
  "api integration",
  "connect api",
  "build tool server",
  "expose api as tools",
];

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function extractSectionHeadingNames(skillText: string): string[] {
  return skillText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("### "))
    .map((line) => line.replace(/^###\s+/, "").trim())
    .slice(0, 6);
}

export function isMcpBuilderIntent(subtask: Pick<SubTask, "description" | "input">): boolean {
  const description = normalizeText(subtask.description);
  const inputText = normalizeText(JSON.stringify(subtask.input ?? {}));
  const haystack = `${description}\n${inputText}`;

  return MCP_BUILDER_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function loadMcpBuilderSkillText(path = DEFAULT_SKILL_PATH): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function buildMcpBuilderGuidance(
  subtask: Pick<SubTask, "description" | "input">,
  context: ExecutionContext,
  skillText = loadMcpBuilderSkillText()
): Record<string, unknown> {
  const headingNames = extractSectionHeadingNames(skillText);

  return {
    workflow: "mcp-builder",
    request: subtask.description,
    recommendedStack: {
      language: "TypeScript",
      transport: "Streamable HTTP (stateless JSON)",
      reason:
        "Matches project stack and guidance in skills/mcp-builder-SKILL.md.",
    },
    requiredInputs: [
      "Target API base URL and authentication method",
      "Endpoint list to expose as MCP tools",
      "Input/output schema expectations",
      "Pagination/rate-limit/error handling requirements",
    ],
    implementationPhases:
      headingNames.length > 0
        ? headingNames
        : [
            "Phase 1: Deep Research and Planning",
            "Phase 2: Implementation",
            "Phase 3: Review and Test",
            "Phase 4: Create Evaluations",
          ],
    nextSteps: [
      "Define tool names and schemas for top API workflows.",
      "Implement authenticated API client and reusable error handling helpers.",
      "Implement MCP tools with structured outputs and pagination support.",
      "Run MCP Inspector and create evaluation questions.",
    ],
    references: [
      "skills/mcp-builder-SKILL.md",
      "https://modelcontextprotocol.io/sitemap.xml",
      "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md",
    ],
    brandContext: {
      brandName: context.brandIdentity.name,
      tone: context.brandIdentity.voice.tone,
    },
  };
}

export function buildMcpBuilderAgentResult(
  subtask: Pick<SubTask, "description" | "input">,
  context: ExecutionContext
): AgentResult {
  const guidance = buildMcpBuilderGuidance(subtask, context);
  return {
    success: true,
    output: JSON.stringify(guidance),
    modelUsed: "mcp-builder-skill",
  };
}
