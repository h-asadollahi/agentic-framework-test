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
 * upgrading a model is a one-line change here.
 */
export const registry = createProviderRegistry({
  anthropic,
  openai,
  google,
});

/**
 * Model aliases map human-readable tiers to specific model IDs.
 * Used by the ModelRouter to resolve agent configs.
 */
export const MODEL_ALIASES: Record<string, string> = {
  // Anthropic
  "anthropic:fast": "anthropic:claude-haiku-4-5-20251001",
  "anthropic:balanced": "anthropic:claude-sonnet-4-5-20250514",
  "anthropic:powerful": "anthropic:claude-opus-4-20250514",

  // OpenAI
  "openai:fast": "openai:gpt-4o-mini",
  "openai:balanced": "openai:gpt-4o",
  "openai:reasoning": "openai:o3",

  // Google
  "google:fast": "google:gemini-2.0-flash",
  "google:balanced": "google:gemini-2.0-pro",
};
