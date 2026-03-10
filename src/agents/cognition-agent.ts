import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { loadAgentPromptSpec } from "../tools/agent-spec-loader.js";

const DEFAULT_CONFIG: AgentConfig = {
  id: "cognition",
  name: "Cognition Agent",
  description:
    "Decomposes the user's request into an executable plan of subtasks with dependencies and priorities.",
  ...getModelAssignment("cognition"),
  preferredModel: getModelAssignment("cognition").preferred,
  fallbackModels: getModelAssignment("cognition").fallbacks,
  maxSteps: 3,
  temperature: 0.3,
  systemPrompt: "",
  autonomyLevel: {
    canSchedule: false,
    canDelegate: false,
    canDecide: true,
    canRetry: true,
    maxDelegationDepth: 0,
  },
  trustBoundary: {
    allowedTools: [],
    blockedActions: [],
    requiresApproval: [],
    maxTokenBudget: 20_000,
  },
};

type PromptLoader = typeof loadAgentPromptSpec;

export const COGNITION_SYSTEM_PROMPT_FILE =
  "knowledge/agents/cognition/system-prompt.md";

export const COGNITION_SYSTEM_PROMPT_FALLBACK = `You are the Cognition Agent in a multi-agent marketing platform for "{{BRAND_NAME}}".

Your role is to decompose the user's request into an executable plan of subtasks.

## Brand Context
- Personality: {{BRAND_PERSONALITY}}
- Values: {{BRAND_VALUES}}
- Voice: {{BRAND_VOICE}}

## Guardrails
- Never do: {{GUARDRAILS_NEVER_DO}}
- Always do: {{GUARDRAILS_ALWAYS_DO}}

## Available Sub-Agents
You can assign subtasks to these agents (by their ID).
Always pass the "input" field as a JSON object matching the agent's schema.

### cohort-monitor
Analyzes audience cohort metrics — engagement, retention, conversion, churn, and LTV.
Detects trends, compares against baselines, and surfaces actionable insights.
Input schema:
{
  "metric": "engagement" | "retention" | "conversion" | "churn" | "ltv",
  "cohortId": "optional string — e.g. 'vip-2024-q4', 'at-risk-segment'",
  "timeRange": "7d" | "30d" | "90d" | "ytd"  (default: "30d"),
  "compareBaseline": true | false              (default: true)
}
Example:
{ "metric": "retention", "cohortId": "vip-2024-q4", "timeRange": "90d" }

(more sub-agents will be added in the future)
{{LEARNED_ROUTES_SECTION}}
{{SKILL_CANDIDATES_SECTION}}
If no specific sub-agent fits, use "general" as the agentId.
The system will check learned routes and may ask the marketer for the data source via Slack.

## Instructions

1. Analyze the user's request.
2. If the request is out of scope for this assistant, reject it.
   Reject when:
   - the user asks about competitors/rivals
   - the user asks for non-marketing topics unrelated to brand/campaign performance
3. Break it down into concrete subtasks.
4. Identify dependencies between subtasks (which must complete before others).
5. Assign each subtask to the most appropriate sub-agent.
6. Set priorities: "critical", "high", "medium", or "low".
7. When a request implies creating a new reusable capability, prefer a skill-creation subtask and reference ./skills/universal-agent-skill-creator.md. New learned skills must be saved under ./skills/learned.
8. If a request matches a persisted skill candidate trigger pattern:
   - if its skill file is not materialized, prepend a skill-creation subtask using agentId "skill-creator"
   - continue with normal execution subtasks in the same plan
   - do not request human approval for this skill lifecycle.
   - if its skill file is already materialized and you add a "general" synthesis/consolidation subtask, include skill metadata in input:
     { "candidateId": "...", "suggestedSkillFile": "skills/learned/..", "useMaterializedSkill": true }
   - do not create route-learning-oriented subtasks for synthesis/consolidation output assembly.

## Output Format

Return a JSON object with this exact structure:
{
  "subtasks": [
    {
      "id": "task-1",
      "agentId": "cohort-monitor",
      "description": "What this subtask does",
      "input": { "key": "value" },
      "dependencies": [],
      "priority": "high"
    }
  ],
  "reasoning": "Why you decomposed it this way",
  "plan": "One-paragraph summary of the execution plan",
  "rejected": false,
  "rejectionReason": null
}

If request is out of scope, return:
{
  "subtasks": [],
  "reasoning": "Why this was rejected",
  "plan": "Request rejected at cognition stage.",
  "rejected": true,
  "rejectionReason": "Short user-facing reason"
}

Be specific about what each subtask should accomplish. Subtasks without dependencies will run in parallel.`;

/**
 * Cognition Agent
 *
 * Second stage of the guardrail pipeline.
 * Takes the user message + grounding context, and produces a plan:
 * a list of SubTasks with dependencies, priorities, and assigned sub-agents.
 */
export class CognitionAgent extends BaseAgent {
  private promptLoader: PromptLoader;
  private promptFile: string;

  constructor(
    config?: Partial<AgentConfig>,
    options?: { promptLoader?: PromptLoader; promptFile?: string }
  ) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? COGNITION_SYSTEM_PROMPT_FILE;
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Cognition is a pure reasoning agent — no tools needed
    return {};
  }

  buildSystemPrompt(context: ExecutionContext): string {
    const brand = context.brandIdentity;
    const guardrails = context.guardrails;
    const vars = {
      BRAND_NAME: brand.name,
      BRAND_PERSONALITY: brand.personality.join(", "),
      BRAND_VALUES: brand.values.join(", "),
      BRAND_VOICE: `${brand.voice.tone}, ${brand.voice.style}`,
      GUARDRAILS_NEVER_DO: guardrails.neverDo.join("; "),
      GUARDRAILS_ALWAYS_DO: guardrails.alwaysDo.join("; "),
      LEARNED_ROUTES_SECTION: this.buildLearnedRoutesSection(),
      SKILL_CANDIDATES_SECTION: this.buildSkillCandidatesSection(),
    };

    return this.promptLoader(
      this.config.id,
      this.promptFile,
      COGNITION_SYSTEM_PROMPT_FALLBACK,
      vars
    );
  }

  /**
   * Build a prompt section listing learned routes so the cognition agent
   * can assign subtasks to the exact target agent for known capabilities.
   */
  private buildLearnedRoutesSection(): string {
    const routes = learnedRoutesStore.getSummary();
    if (routes.length === 0) return "";

    const routeLines = routes
      .map(
        (r) => {
          const target =
            r.routeType === "sub-agent" && r.agentId
              ? `sub-agent:${r.agentId}`
              : `api:${r.endpointUrl ?? "unknown-endpoint"}`;
          const inputHint =
            r.routeType === "sub-agent" && r.agentId
              ? `{ "routeId": "${r.id}", ...relevant params for ${r.agentId}... }`
              : `{ "routeId": "${r.id}", "params": { ...relevant params... } }`;
          const workflowHint =
            r.routeType === "api" && r.workflowType
              ? ` (workflow: ${r.workflowType})`
              : "";

          return (
            `- **${r.capability}** (routeId: "${r.id}", target: ${target}${workflowHint}): ${r.description}\n` +
            `  Match keywords: ${r.matchPatterns.slice(0, 5).join(", ")}\n` +
            `  Input: ${inputHint}`
          );
        }
      )
      .join("\n\n");

    return `
### Learned Routes (Authoritative Targets)
When a request matches one of these routes, assign agentId from its target:
- target: sub-agent:* -> assign that exact sub-agent ID (for MCP routes, typically "mcp-fetcher")
- target: api:* -> assign agentId "api-fetcher"
- include routeId in input whenever possible to preserve deterministic execution routing

${routeLines}
`;
  }

  private buildSkillCandidatesSection(): string {
    const candidates = skillCandidatesStore.getSummary();
    if (candidates.length === 0) return "";

    const lines = candidates
      .map(
        (candidate) =>
          `- **${candidate.capability}** (candidateId: "${candidate.id}", confidence: ${candidate.confidence}, requiresApproval: ${candidate.requiresApproval}): ${candidate.description}\n` +
          `  Suggested file: ${candidate.suggestedSkillFile} (materialized: ${candidate.materialized})\n` +
          `  Trigger patterns: ${candidate.triggerPatterns.slice(0, 5).join(", ")}`
      )
      .join("\n\n");

    return `
### Skill Candidates (Persisted from Agency)
Use this section for autonomous self-learning and deterministic skill reuse.
- If user prompt matches trigger patterns and the skill is not materialized, add a "skill-creator" subtask first.
- If the skill is materialized, keep normal execution subtasks and annotate any "general" synthesis/consolidation subtask input with: { "candidateId": "...", "suggestedSkillFile": "...", "useMaterializedSkill": true }.
- Then proceed with normal execution subtasks in the same plan (no human approval required for skill creation/reuse).
- Include candidate metadata in input where possible: { "candidateId": "...", "suggestedSkillFile": "...", "triggerPatterns": [...], "autoCreate": true }.

${lines}
`;
  }
}

export const cognitionAgent = new CognitionAgent();
