/**
 * Per-agent model assignment.
 *
 * Each agent has a preferred model and an ordered fallback chain.
 * If the preferred model fails, the agent tries each fallback in order.
 * If all fail, human-in-the-loop escalation is triggered.
 *
 * Model IDs are aliases defined in providers.ts (e.g. "anthropic:fast").
 *
 * Override any agent's models via env var:
 *   AGENT_GROUNDING_MODELS=anthropic:fast,openai:fast,google:fast
 *
 * The first value is the preferred model, the rest are fallbacks.
 * The env var name follows the pattern:
 *   AGENT_{AGENT_ID}_MODELS  (uppercased, hyphens → underscores)
 */
export interface ModelAssignment {
  preferred: string;
  fallbacks: string[];
}

/**
 * Default agent → model assignments, used when the env var is not set.
 */
const DEFAULTS: Record<string, ModelAssignment> = {
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
 * Convert an agent ID like "notification-manager" to its env var name
 * "AGENT_NOTIFICATION_MANAGER_MODELS".
 */
function agentIdToEnvVar(agentId: string): string {
  return `AGENT_${agentId.replace(/-/g, "_").toUpperCase()}_MODELS`;
}

/**
 * Parse a comma-separated env var value into a ModelAssignment.
 * First value = preferred, rest = fallbacks.
 *
 * Example: "anthropic:balanced,openai:reasoning,google:balanced"
 *   → { preferred: "anthropic:balanced", fallbacks: ["openai:reasoning", "google:balanced"] }
 */
function parseModelsEnv(value: string): ModelAssignment | null {
  const models = value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  if (models.length === 0) return null;

  return {
    preferred: models[0],
    fallbacks: models.slice(1),
  };
}

/**
 * Build the agent model map at startup by reading env vars with DEFAULTS as fallback.
 */
function buildAgentModelMap(): Record<string, ModelAssignment> {
  const map: Record<string, ModelAssignment> = {};

  for (const [agentId, defaultAssignment] of Object.entries(DEFAULTS)) {
    const envVar = agentIdToEnvVar(agentId);
    const envValue = process.env[envVar]?.trim();

    if (envValue) {
      const parsed = parseModelsEnv(envValue);
      map[agentId] = parsed ?? defaultAssignment;
    } else {
      map[agentId] = defaultAssignment;
    }
  }

  return map;
}

export const AGENT_MODEL_MAP: Record<string, ModelAssignment> =
  buildAgentModelMap();

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
