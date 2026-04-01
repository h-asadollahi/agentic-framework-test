import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { buildKnowledgeTools } from "../tools/knowledge-tools.js";
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
    allowedTools: [
      "readCurrentBrandIdentity",
      "readCurrentGuardrails",
      "readBrandGuidelines",
    ],
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

1. Read the current request-aware brand identity using the context tools.
2. Read the current request-aware guardrails using the context tools.
3. Read the current brand/admin guidelines using the context tools.
4. If you identify a repeated pattern that should become reusable agent capability, propose a new skill using the structure in ./skills/universal-agent-skill-creator.md and indicate learned skills should be stored under ./skills/learned.

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

Always use the tools to read the resolved request context. Do not invent or assume content.`;

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

  getTools(context: ExecutionContext): Record<string, Tool> {
    return buildKnowledgeTools(context);
  }

  buildSystemPrompt(_context: ExecutionContext): string {
    return this.promptLoader(
      this.config.id,
      this.promptFile,
      GROUNDING_SYSTEM_PROMPT_FALLBACK
    );
  }

  protected override getPromptSourceIdentifier(): string | null {
    return this.promptFile;
  }
}

export const groundingAgent = new GroundingAgent();
