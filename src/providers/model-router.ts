import type { LanguageModel } from "ai";
import { registry, MODEL_ALIASES } from "../config/providers.js";
import { getModelAssignment } from "../config/models.js";

// The registry expects template literal types like `provider:${string}`
type RegistryModelId = `anthropic:${string}` | `openai:${string}` | `google:${string}`;

/**
 * ModelRouter resolves model alias strings into actual LanguageModel instances.
 *
 * It supports:
 * - Alias resolution: "anthropic:fast" → "anthropic:claude-haiku-4-5-20251001"
 * - Direct model IDs: "anthropic:claude-sonnet-4-5-20250514" (passthrough)
 * - Agent-based lookup: getModelsForAgent("cognition") returns [preferred, ...fallbacks]
 * - Complexity-based selection: selectByComplexity("high") → "anthropic:powerful"
 */
export class ModelRouter {
  /**
   * Resolve a model alias or direct ID into a LanguageModel instance.
   */
  resolve(modelId: string): LanguageModel {
    const resolved = MODEL_ALIASES[modelId] ?? modelId;
    return registry.languageModel(resolved as RegistryModelId);
  }

  /**
   * Get the ordered list of models (preferred + fallbacks) for an agent.
   */
  getModelsForAgent(agentId: string): string[] {
    const assignment = getModelAssignment(agentId);
    return [assignment.preferred, ...assignment.fallbacks];
  }

  /**
   * Select a model based on task complexity.
   * Optionally constrain to a specific provider.
   */
  selectByComplexity(
    complexity: "low" | "medium" | "high",
    provider: "anthropic" | "openai" | "google" = "anthropic"
  ): string {
    const tierMap = { low: "fast", medium: "balanced", high: "powerful" } as const;
    const tier = tierMap[complexity];
    const alias = `${provider}:${tier}`;

    // Fall back to balanced if tier doesn't exist for provider
    if (MODEL_ALIASES[alias]) return alias;
    return `${provider}:balanced`;
  }
}

/**
 * Singleton instance for convenience.
 */
export const modelRouter = new ModelRouter();
