import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";

const DEFAULT_CONFIG: AgentConfig = {
  id: "agency",
  name: "Agency Agent",
  description:
    "Executes the subtask plan by invoking sub-agents and aggregating results.",
  ...getModelAssignment("agency"),
  preferredModel: getModelAssignment("agency").preferred,
  fallbackModels: getModelAssignment("agency").fallbacks,
  maxSteps: 10,
  temperature: 0.2,
  systemPrompt: "",
  autonomyLevel: {
    canSchedule: false,
    canDelegate: true,
    canDecide: true,
    canRetry: true,
    maxDelegationDepth: 2,
  },
  trustBoundary: {
    allowedTools: ["*"],
    blockedActions: ["delete-data", "modify-billing"],
    requiresApproval: ["send-campaign", "modify-audience"],
    maxTokenBudget: 50_000,
  },
};

/**
 * Agency Agent
 *
 * Third stage of the guardrail pipeline.
 * In the trigger.dev architecture, this agent's logic is mostly coordination:
 * the actual sub-agent execution happens via trigger.dev batch tasks.
 *
 * This agent handles:
 * - Interpreting subtask results
 * - Aggregating outputs from parallel sub-agents
 * - Making decisions when subtasks fail or return unexpected results
 */
export class AgencyAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Tools are injected at the trigger.dev task level
    // (sub-agents are triggered via batch.triggerByTaskAndWait)
    return {};
  }

  buildSystemPrompt(context: ExecutionContext): string {
    const brand = context.brandIdentity;
    const guardrails = context.guardrails;

    return `You are the Agency Agent in a multi-agent marketing platform for "${brand.name}".

Your role is to analyze the results from sub-agent executions and produce a coherent summary.

## Guardrails
- Never do: ${guardrails.neverDo.join("; ")}
- Always do: ${guardrails.alwaysDo.join("; ")}

## Instructions

You will receive the results of sub-agent task executions as input.
Your job is to:

1. Analyze each sub-agent's output.
2. Check for failures and determine if the overall task can still succeed.
3. Aggregate the results into a coherent summary.
4. Flag any issues that need human attention.

## Output Format

Return a JSON object with this structure:
{
  "results": [
    {
      "subtaskId": "task-1",
      "agentId": "cohort-monitor",
      "status": "completed",
      "output": "... summarized result ..."
    }
  ],
  "summary": "Overall summary of what was accomplished",
  "issues": ["Any issues or warnings to flag"],
  "needsHumanReview": false
}`;
  }
}

export const agencyAgent = new AgencyAgent();
