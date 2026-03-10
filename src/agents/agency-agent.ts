import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";
import { loadAgentPromptSpec } from "../tools/agent-spec-loader.js";

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

type PromptLoader = typeof loadAgentPromptSpec;

export const AGENCY_SYSTEM_PROMPT_FILE =
  "knowledge/agents/agency/system-prompt.md";

export const AGENCY_SYSTEM_PROMPT_FALLBACK = `You are the Agency Agent in a multi-agent marketing platform for "{{BRAND_NAME}}".

Your role is to analyze the results from sub-agent executions and produce a coherent summary.

## Guardrails
- Never do: {{GUARDRAILS_NEVER_DO}}
- Always do: {{GUARDRAILS_ALWAYS_DO}}

## Instructions

You will receive the results of sub-agent task executions as input.
Your job is to:

1. Analyze each sub-agent's output.
2. Check for failures and determine if the overall task can still succeed.
3. Aggregate the results into a coherent summary.
4. Flag any issues that need human attention.
5. If execution reveals a repeatable workflow opportunity, recommend creating a reusable skill based on ./skills/universal-agent-skill-creator.md and specify that learned skills should be added under ./skills/learned.
6. When recommending a reusable skill, add a structured entry under "skillSuggestions".

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
  "needsHumanReview": false,
  "skillSuggestions": [
    {
      "capability": "mapp-monthly-analysis-usage",
      "description": "Automate monthly API calculation usage retrieval and summary.",
      "suggestedSkillFile": "skills/learned/mapp-monthly-analysis-usage.md",
      "triggerPatterns": ["how many api calculations have i used this month", "monthly api usage"],
      "confidence": "high",
      "requiresApproval": false,
      "sourceSubtaskId": "task-1"
    }
  ]
}`;

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
  private promptLoader: PromptLoader;
  private promptFile: string;

  constructor(
    config?: Partial<AgentConfig>,
    options?: { promptLoader?: PromptLoader; promptFile?: string }
  ) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? AGENCY_SYSTEM_PROMPT_FILE;
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Tools are injected at the trigger.dev task level
    // (sub-agents are triggered via batch.triggerByTaskAndWait)
    return {};
  }

  buildSystemPrompt(context: ExecutionContext): string {
    const vars = {
      BRAND_NAME: context.brandIdentity.name,
      GUARDRAILS_NEVER_DO: context.guardrails.neverDo.join("; "),
      GUARDRAILS_ALWAYS_DO: context.guardrails.alwaysDo.join("; "),
    };

    return this.promptLoader(
      this.config.id,
      this.promptFile,
      AGENCY_SYSTEM_PROMPT_FALLBACK,
      vars
    );
  }
}

export const agencyAgent = new AgencyAgent();
