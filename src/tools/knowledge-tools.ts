import { tool } from "ai";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrandDna, CustomerDna, ExecutionContext } from "../core/types.js";

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

  const readBrandDna = tool({
    description:
      "Read the structured Brand DNA for this brand: attribute envelopes (allowed/excluded values per dimension), compositional grammar rules, trend policy, and semantic anchors. Use this to understand what brand-compliant output looks like in concrete, checkable terms.",
    inputSchema: z.object({}),
    execute: async () => {
      const brandId = context.requestContext.brandId;
      const filePath = brandId
        ? join("knowledge/brands", brandId, "brand-dna.json")
        : "knowledge/brand-dna.json";
      try {
        const raw = await readFile(filePath, "utf-8");
        return { brandDna: JSON.parse(raw) as BrandDna, found: true };
      } catch {
        return { brandDna: null, found: false };
      }
    },
  });

  const readCustomerDna = tool({
    description:
      "Read the Customer DNA for this brand: cohort profiles, semantic vocabulary preferences, behavioral signals, fit anchors, and drift indicators. Use this to understand who the marketer's customers are and what brand-fit means from their perspective.",
    inputSchema: z.object({}),
    execute: async () => {
      const brandId = context.requestContext.brandId;
      const filePath = brandId
        ? join("knowledge/brands", brandId, "customer-dna.json")
        : "knowledge/customer-dna.json";
      try {
        const raw = await readFile(filePath, "utf-8");
        return { customerDna: JSON.parse(raw) as CustomerDna, found: true };
      } catch {
        return { customerDna: null, found: false };
      }
    },
  });

  return {
    readCurrentBrandIdentity,
    readCurrentGuardrails,
    readBrandGuidelines,
    readBrandDna,
    readCustomerDna,
  };
}
