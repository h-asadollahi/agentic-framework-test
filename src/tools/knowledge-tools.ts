import { tool } from "ai";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

/**
 * AI SDK tools for accessing the knowledge base.
 * These are made available to agents that need to read brand context.
 *
 * Note: AI SDK v6 uses `inputSchema` (not `parameters`).
 */

export const readSoulFile = tool({
  description:
    "Read the brand identity file (soul.md). Returns the full markdown content defining brand personality, values, voice, and guidelines.",
  inputSchema: z.object({}),
  execute: async () => {
    const filePath = resolve(PROJECT_ROOT, "soul.md");
    if (!existsSync(filePath)) {
      return { content: "", found: false };
    }
    return { content: readFileSync(filePath, "utf-8"), found: true };
  },
});

export const readGuardrails = tool({
  description:
    "Read the guardrails file. Returns hard constraints: never-do rules, always-do rules, brand voice rules, and content policies.",
  inputSchema: z.object({}),
  execute: async () => {
    const filePath = resolve(PROJECT_ROOT, "knowledge/guardrails.md");
    if (!existsSync(filePath)) {
      return { content: "", found: false };
    }
    return { content: readFileSync(filePath, "utf-8"), found: true };
  },
});

export const readBrandGuidelines = tool({
  description:
    "Read the brand guidelines file. Returns communication channels, campaign types, and key metrics.",
  inputSchema: z.object({}),
  execute: async () => {
    const filePath = resolve(PROJECT_ROOT, "knowledge/brand-guidelines.md");
    if (!existsSync(filePath)) {
      return { content: "", found: false };
    }
    return { content: readFileSync(filePath, "utf-8"), found: true };
  },
});

/**
 * Bundle all knowledge tools for easy inclusion in agent configs.
 */
export const knowledgeTools = {
  readSoulFile,
  readGuardrails,
  readBrandGuidelines,
};
