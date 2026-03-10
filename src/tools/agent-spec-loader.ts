import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { logger } from "../core/logger.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

function resolvePromptPath(promptFile: string): string {
  if (isAbsolute(promptFile)) return promptFile;
  return resolve(PROJECT_ROOT, promptFile);
}

function interpolatePrompt(content: string, vars: Record<string, string>): string {
  return content.replace(PLACEHOLDER_PATTERN, (_, key: string) => vars[key] ?? "");
}

/**
 * Load an agent prompt spec from markdown.
 *
 * - Reads prompt markdown from disk (typically under knowledge/agents/...)
 * - Returns fallback prompt when file is missing, empty, or unreadable
 * - Supports simple interpolation with {{KEY}} placeholders
 */
export function loadAgentPromptSpec(
  agentId: string,
  promptFile: string,
  fallback: string,
  vars: Record<string, string> = {}
): string {
  const filePath = resolvePromptPath(promptFile);

  if (!existsSync(filePath)) {
    logger.warn(`Agent prompt file missing, using fallback`, {
      agent: agentId,
      promptFile: filePath,
    });
    return fallback;
  }

  try {
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) {
      logger.warn(`Agent prompt file is empty, using fallback`, {
        agent: agentId,
        promptFile: filePath,
      });
      return fallback;
    }

    return interpolatePrompt(content, vars);
  } catch (error) {
    logger.warn(`Agent prompt file read failed, using fallback`, {
      agent: agentId,
      promptFile: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
