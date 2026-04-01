import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { logger } from "../core/logger.js";

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
const promptCache = new Map<string, { mtimeMs: number; content: string }>();

export type PromptLoadOptions = {
  brandId?: string | null;
};

export type ResolvedPromptSpec = {
  content: string;
  source: string | null;
};

function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    const hasPackageJson = existsSync(join(current, "package.json"));
    const hasKnowledgeDir = existsSync(join(current, "knowledge"));

    if (hasPackageJson && hasKnowledgeDir) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveProjectRoot(): string {
  return (
    findProjectRoot(process.cwd()) ??
    findProjectRoot(import.meta.dirname) ??
    resolve(import.meta.dirname, "../..")
  );
}

function resolvePromptPath(promptFile: string): string {
  if (isAbsolute(promptFile)) return promptFile;
  return resolve(resolveProjectRoot(), promptFile);
}

export function resolveBrandOverridePromptFile(
  promptFile: string,
  brandId?: string | null
): string | null {
  const normalizedBrandId = String(brandId ?? "").trim();
  if (!normalizedBrandId || isAbsolute(promptFile)) return null;

  const normalizedPromptFile = promptFile.replace(/\\/g, "/").replace(/^\.\//, "");

  if (normalizedPromptFile.startsWith("knowledge/agents/")) {
    const suffix = normalizedPromptFile.slice("knowledge/agents/".length);
    return `knowledge/brands/${normalizedBrandId}/agents/${suffix}`;
  }

  if (normalizedPromptFile.startsWith("knowledge/sub-agents/")) {
    const suffix = normalizedPromptFile.slice("knowledge/sub-agents/".length);
    return `knowledge/brands/${normalizedBrandId}/sub-agents/${suffix}`;
  }

  return null;
}

function interpolatePrompt(content: string, vars: Record<string, string>): string {
  return content.replace(PLACEHOLDER_PATTERN, (_, key: string) => vars[key] ?? "");
}

function readPromptFromCache(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  const stat = statSync(filePath);
  const cached = promptCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.content;
  }

  const content = readFileSync(filePath, "utf-8").trim();
  promptCache.set(filePath, { mtimeMs: stat.mtimeMs, content });
  return content;
}

export function resolveAgentPromptSpec(
  agentId: string,
  promptFile: string,
  fallback: string,
  vars: Record<string, string> = {},
  options: PromptLoadOptions = {}
): ResolvedPromptSpec {
  const brandOverridePromptFile = resolveBrandOverridePromptFile(
    promptFile,
    options.brandId
  );
  const candidatePromptFiles = [
    ...(brandOverridePromptFile ? [brandOverridePromptFile] : []),
    promptFile,
  ];

  for (const candidatePromptFile of candidatePromptFiles) {
    const filePath = resolvePromptPath(candidatePromptFile);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const content = readPromptFromCache(filePath);
      if (!content) {
        logger.warn(`Agent prompt file is empty, trying fallback candidate`, {
          agent: agentId,
          promptFile: filePath,
        });
        continue;
      }

      return {
        content: interpolatePrompt(content, vars),
        source: candidatePromptFile,
      };
    } catch (error) {
      logger.warn(`Agent prompt file read failed, trying fallback candidate`, {
        agent: agentId,
        promptFile: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const missingPaths = candidatePromptFiles.map((candidatePromptFile) =>
    resolvePromptPath(candidatePromptFile)
  );
  logger.warn(`Agent prompt file missing, using fallback`, {
    agent: agentId,
    promptFile: missingPaths.join(" | "),
  });

  return {
    content: interpolatePrompt(fallback, vars),
    source: null,
  };
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
  vars: Record<string, string> = {},
  options: PromptLoadOptions = {}
): string {
  return resolveAgentPromptSpec(agentId, promptFile, fallback, vars, options).content;
}
