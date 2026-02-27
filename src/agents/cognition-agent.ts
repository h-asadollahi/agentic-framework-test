import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";

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
You can assign subtasks to these agents (by their ID):
- "cohort-monitor": Monitors customer cohorts and detects size changes
- (more sub-agents will be added in the future)

If no specific sub-agent fits, use "general" as the agentId.

## Instructions

1. Analyze the user's request.
2. Break it down into concrete subtasks.
3. Identify dependencies between subtasks (which must complete before others).
4. Assign each subtask to the most appropriate sub-agent.
5. Set priorities: "critical", "high", "medium", or "low".

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
  "plan": "One-paragraph summary of the execution plan"
}

Be specific about what each subtask should accomplish. Subtasks without dependencies will run in parallel.`;
  }
}

export const cognitionAgent = new CognitionAgent();
