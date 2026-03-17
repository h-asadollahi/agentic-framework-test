import { tool } from "ai";
import { z } from "zod";
import type { ExecutionContext } from "../core/types.js";

/**
 * AI SDK tools for accessing the already-resolved execution context.
 * This keeps Grounding tenant-aware instead of hardwiring a single repo-level brand.
 */
export function buildKnowledgeTools(context: ExecutionContext) {
  const readCurrentBrandIdentity = tool({
    description:
      "Read the currently resolved brand identity for this request. Returns the brand name, personality, values, voice, target audience, and guidelines.",
    inputSchema: z.object({}),
    execute: async () => ({
      audience: context.requestContext.audience,
      brandId: context.requestContext.brandId,
      scope: context.requestContext.scope,
      brandIdentity: context.brandIdentity,
      found: true,
    }),
  });

  const readCurrentGuardrails = tool({
    description:
      "Read the currently resolved guardrails for this request. Returns never-do rules, always-do rules, brand voice rules, and content policies.",
    inputSchema: z.object({}),
    execute: async () => ({
      audience: context.requestContext.audience,
      brandId: context.requestContext.brandId,
      scope: context.requestContext.scope,
      guardrails: context.guardrails,
      found: true,
    }),
  });

  const readBrandGuidelines = tool({
    description:
      "Read the current brand/admin guidelines that should steer the response tone and scope for this request.",
    inputSchema: z.object({}),
    execute: async () => ({
      guidelines: context.brandIdentity.guidelines,
      targetAudience: context.brandIdentity.targetAudience,
      requestContext: context.requestContext,
      found: true,
    }),
  });

  return {
    readCurrentBrandIdentity,
    readCurrentGuardrails,
    readBrandGuidelines,
  };
}
