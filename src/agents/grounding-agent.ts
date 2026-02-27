import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { knowledgeTools } from "../tools/knowledge-tools.js";
import { getModelAssignment } from "../config/models.js";

const DEFAULT_CONFIG: AgentConfig = {
  id: "grounding",
  name: "Grounding Agent",
  description:
    "Establishes brand context by reading soul.md and guardrails. Provides the identity foundation for all downstream agents.",
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

/**
 * Grounding Agent
 *
 * First stage of the guardrail pipeline.
 * Reads soul.md and guardrails.md to establish brand identity and constraints.
 * Its output feeds into the Cognition agent as foundational context.
 */
export class GroundingAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return knowledgeTools;
  }

  buildSystemPrompt(_context: ExecutionContext): string {
    return `You are the Grounding Agent in a multi-agent marketing platform.

Your role is to establish the brand identity and constraints that all other agents must follow.

## Instructions

1. Read the soul.md file to understand the brand's personality, values, and voice.
2. Read the guardrails file to understand the hard constraints (never-do and always-do rules).
3. Read the brand guidelines for communication channels and key metrics.

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
  }
}

export const groundingAgent = new GroundingAgent();
