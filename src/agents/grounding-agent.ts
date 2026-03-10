import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { knowledgeTools } from "../tools/knowledge-tools.js";
import { getModelAssignment } from "../config/models.js";
import { loadAgentPromptSpec } from "../tools/agent-spec-loader.js";

const DEFAULT_CONFIG: AgentConfig = {
  id: "grounding",
  name: "Grounding Agent",
  description:
    "Establishes brand context by reading knowledge/soul.md and guardrails. Provides the identity foundation for all downstream agents.",
  ...getModelAssignment("grounding"),
  preferredModel: getModelAssignment("grounding").preferred,
  fallbackModels: getModelAssignment("grounding").fallbacks,
  maxSteps: 5,
  temperature: 0.1,
  systemPrompt: "", // built dynamically
  autonomyLevel: {
    canSchedule: false,
    canDelegate: false,
    canDecide: true,
    canRetry: true,
    maxDelegationDepth: 0,
  },
  trustBoundary: {
    allowedTools: ["readSoulFile", "readGuardrails", "readBrandGuidelines"],
    blockedActions: [],
    requiresApproval: [],
    maxTokenBudget: 10_000,
  },
};

type PromptLoader = typeof loadAgentPromptSpec;

export const GROUNDING_SYSTEM_PROMPT_FILE =
  "knowledge/agents/grounding/system-prompt.md";

export const GROUNDING_SYSTEM_PROMPT_FALLBACK = `You are the Grounding Agent in a multi-agent marketing platform.

Your role is to establish the brand identity and constraints that all other agents must follow.

## Instructions

1. Read the knowledge/soul.md file to understand the brand's personality, values, and voice.
2. Read the guardrails file to understand the hard constraints (never-do and always-do rules).
3. Read the brand guidelines for communication channels and key metrics.
4. If you identify a repeated pattern that should become reusable agent capability, propose a new skill using the structure in ./skills/universal-agent-skill-creator.md and indicate it should be stored under ./skills.

## Output Format

Return a JSON object with this exact structure:
{
  "brandIdentity": {
    "name": "...",
    "personality": ["..."],
    "values": ["..."],
    "voice": { "tone": "...", "style": "...", "neverSay": ["..."] },
    "targetAudience": "..."
  },
  "guardrails": {
    "neverDo": ["..."],
    "alwaysDo": ["..."],
    "brandVoiceRules": ["..."],
    "contentPolicies": ["..."]
  },
  "summary": "A one-sentence summary of the brand identity and key constraints."
}

Always use the tools to read the actual files. Do not invent or assume content.`;

/**
 * Grounding Agent
 *
 * First stage of the guardrail pipeline.
 * Reads knowledge/soul.md and guardrails.md to establish brand identity and constraints.
 * Its output feeds into the Cognition agent as foundational context.
 */
export class GroundingAgent extends BaseAgent {
  private promptLoader: PromptLoader;
  private promptFile: string;

  constructor(
    config?: Partial<AgentConfig>,
    options?: { promptLoader?: PromptLoader; promptFile?: string }
  ) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? GROUNDING_SYSTEM_PROMPT_FILE;
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return knowledgeTools;
  }

  buildSystemPrompt(_context: ExecutionContext): string {
    return this.promptLoader(
      this.config.id,
      this.promptFile,
      GROUNDING_SYSTEM_PROMPT_FALLBACK
    );
  }
}

export const groundingAgent = new GroundingAgent();
