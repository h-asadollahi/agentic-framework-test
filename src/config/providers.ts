import { experimental_createProviderRegistry as createProviderRegistry } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

/**
 * Unified provider registry for multi-model support.
 *
 * Models are referenced as "provider:alias" strings throughout the codebase,
 * e.g. "anthropic:fast", "openai:balanced", "google:fast".
 *
 * This decouples agent code from specific model versions —
 * upgrading a model is a one-line change in the .env file.
 */
export const registry = createProviderRegistry({
  anthropic,
  openai,
  google,
});

/**
 * Default model aliases — used when the corresponding env var is not set.
 *
 * Override any alias by setting the matching env var in .env:
 *   MODEL_ANTHROPIC_FAST=claude-haiku-4-5
 *   MODEL_OPENAI_BALANCED=gpt-5
 *   MODEL_OPENAI_POWERFUL=gpt-5.2
 *   MODEL_GOOGLE_FAST=gemini-2.5-flash-lite
 *
 * The env var name follows the pattern:
 *   MODEL_{PROVIDER}_{TIER}  (uppercased, hyphens → underscores)
 *
 * The value is the bare model ID (without the provider prefix).
 * The provider prefix ("anthropic:", "openai:", "google:") is added automatically.
 */
const DEFAULTS: Record<string, string> = {
  // Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview
  "anthropic:fast": "claude-haiku-4-5",
  "anthropic:balanced": "claude-sonnet-4-6",
  "anthropic:powerful": "claude-opus-4-6",

  // OpenAI
  "openai:fast": "gpt-5-mini",
  "openai:balanced": "gpt-5",
  "openai:powerful": "gpt-5.2",
  "openai:reasoning": "gpt-5.2",

  // Google — https://ai.google.dev/gemini-api/docs/models
  "google:fast": "gemini-2.5-flash-lite",
  "google:balanced": "gemini-2.5-pro",
};

/**
 * Convert an alias key like "anthropic:fast" to its env var name "MODEL_ANTHROPIC_FAST".
 */
function aliasToEnvVar(alias: string): string {
  return `MODEL_${alias.replace(":", "_").replace(/-/g, "_").toUpperCase()}`;
}

/**
 * Build MODEL_ALIASES at startup by reading env vars with DEFAULTS as fallback.
 *
 * For each alias (e.g. "anthropic:fast"):
 *   1. Check env var MODEL_ANTHROPIC_FAST
 *   2. If set, use that value as the model ID
 *   3. If not set, use the hardcoded default
 *   4. Prefix with "provider:" for the registry
 */
function buildModelAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const [alias, defaultModel] of Object.entries(DEFAULTS)) {
    const envVar = aliasToEnvVar(alias);
    const provider = alias.split(":")[0]; // "anthropic", "openai", "google"
    const envValue = process.env[envVar]?.trim();

    // Use env var value if set, otherwise use the default
    const modelId = envValue || defaultModel;

    // Store as "provider:modelId" for the registry
    aliases[alias] = `${provider}:${modelId}`;
  }

  return aliases;
}

export const MODEL_ALIASES: Record<string, string> = buildModelAliases();
