import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";

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

/**
 * Cognition Agent
 *
 * Second stage of the guardrail pipeline.
 * Takes the user message + grounding context, and produces a plan:
 * a list of SubTasks with dependencies, priorities, and assigned sub-agents.
 */
export class CognitionAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Cognition is a pure reasoning agent — no tools needed
    return {};
  }

  buildSystemPrompt(context: ExecutionContext): string {
    const brand = context.brandIdentity;
    const guardrails = context.guardrails;

    return `You are the Cognition Agent in a multi-agent marketing platform for "${brand.name}".

Your role is to decompose the user's request into an executable plan of subtasks.

## Brand Context
- Personality: ${brand.personality.join(", ")}
- Values: ${brand.values.join(", ")}
- Voice: ${brand.voice.tone}, ${brand.voice.style}

## Guardrails
- Never do: ${guardrails.neverDo.join("; ")}
- Always do: ${guardrails.alwaysDo.join("; ")}

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
${this.buildLearnedRoutesSection()}
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
  }

  /**
   * Build a prompt section listing learned API routes so the cognition agent
   * can assign subtasks to "api-fetcher" instead of "general" for known routes.
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

          return (
            `- **${r.capability}** (routeId: "${r.id}", target: ${target}): ${r.description}\n` +
            `  Match keywords: ${r.matchPatterns.slice(0, 5).join(", ")}\n` +
            `  Input: ${inputHint}`
          );
        }
      )
      .join("\n\n");

    return `
### api-fetcher (Learned API Routes)
When a request matches one of these routes, route according to its target:
- target: api:* -> assign agentId "api-fetcher"
- target: sub-agent:* -> assign the specified sub-agent ID directly

${routeLines}
`;
  }
}

export const cognitionAgent = new CognitionAgent();
