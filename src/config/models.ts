/**
 * Per-agent model assignment.
 *
 * Each agent has a preferred model and an ordered fallback chain.
 * If the preferred model fails, the agent tries each fallback in order.
 * If all fail, human-in-the-loop escalation is triggered.
 *
 * Model IDs are aliases defined in providers.ts (e.g. "anthropic:fast").
 */
export interface ModelAssignment {
  preferred: string;
  fallbacks: string[];
}

export const AGENT_MODEL_MAP: Record<string, ModelAssignment> = {
  // Orchestrator — needs strong reasoning for pipeline coordination
  orchestrator: {
    preferred: "anthropic:powerful",
    fallbacks: ["openai:balanced", "google:balanced"],
  },

  // Grounding — simple context loading, speed matters
  grounding: {
    preferred: "anthropic:fast",
    fallbacks: ["openai:fast", "google:fast"],
  },

  // Cognition — planning & goal decomposition needs good reasoning
  cognition: {
    preferred: "anthropic:balanced",
    fallbacks: ["openai:reasoning", "google:balanced"],
  },

  // Agency — tool chaining, moderate complexity
  agency: {
    preferred: "anthropic:balanced",
    fallbacks: ["openai:balanced", "google:balanced"],
  },

  // Interface — formatting & routing, speed matters
  interface: {
    preferred: "anthropic:fast",
    fallbacks: ["openai:fast", "google:fast"],
  },

  // Notification Manager — simple routing decisions
  "notification-manager": {
    preferred: "anthropic:fast",
    fallbacks: ["openai:fast"],
  },
};

/**
 * Get model assignment for an agent.
 * Falls back to a default (anthropic:balanced) for unknown agents.
 */
export function getModelAssignment(agentId: string): ModelAssignment {
  return (
    AGENT_MODEL_MAP[agentId] ?? {
      preferred: "anthropic:balanced",
      fallbacks: ["openai:balanced", "google:balanced"],
    }
  );
}
