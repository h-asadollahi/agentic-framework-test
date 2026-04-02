import type {
  ExecutionContext,
  LongTermMemory,
  RequestContext,
  ShortTermMemory,
} from "./types.js";
import { createMarketerRequestContext } from "./request-context.js";
import { shortTermMemory } from "../memory/short-term.js";
import { brandStore, DEFAULT_SEEDED_BRAND_ID } from "../tenancy/brand-store.js";
import {
  getSystemAdminGuardrails,
  getSystemAdminIdentity,
  parseGuardrailsFile,
  parseSoulFile,
} from "../tenancy/brand-seed.js";
import { createBrandContract } from "./brand-contract.js";

export { parseSoulFile, parseGuardrailsFile } from "../tenancy/brand-seed.js";

function cloneShortTermMemory(memory: ShortTermMemory): ShortTermMemory {
  return {
    sessionId: memory.sessionId,
    activeContext: { ...memory.activeContext },
    conversationHistory: memory.conversationHistory.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
      metadata: message.metadata ? { ...message.metadata } : undefined,
    })),
  };
}

function getEmptyLongTermMemory(): LongTermMemory {
  return {
    synthesizedLearnings: [],
    pastDecisions: [],
    brandContextCache: {},
  };
}

function buildDefaultRequestContext(): RequestContext {
  return createMarketerRequestContext(DEFAULT_SEEDED_BRAND_ID, "api");
}

/**
 * Build a full ExecutionContext for a session.
 */
export async function buildExecutionContext(
  sessionId: string,
  requestContext: RequestContext = buildDefaultRequestContext()
): Promise<ExecutionContext> {
  const sessionMemory = cloneShortTermMemory(shortTermMemory.get(sessionId));

  if (requestContext.audience === "admin" && !requestContext.brandId) {
    const brandIdentity = getSystemAdminIdentity();
    const guardrails = getSystemAdminGuardrails();
    return {
      sessionId,
      requestContext,
      brandIdentity,
      guardrails,
      brandContract: createBrandContract({
        brandId: null,
        audience: requestContext.audience,
        scope: requestContext.scope,
        brandIdentity,
        guardrails,
      }),
      shortTermMemory: sessionMemory,
      longTermMemory: getEmptyLongTermMemory(),
    };
  }

  if (!requestContext.brandId) {
    throw new Error("brandId is required for brand-scoped execution context");
  }

  const brand = await brandStore.getBrandById(requestContext.brandId);
  if (!brand) {
    throw new Error(`Unknown brandId "${requestContext.brandId}"`);
  }

  return {
    sessionId,
    requestContext,
    brandIdentity: brand.brandIdentity,
    guardrails: brand.guardrails,
    brandContract: createBrandContract({
      brandId: requestContext.brandId,
      audience: requestContext.audience,
      scope: requestContext.scope,
      brandIdentity: brand.brandIdentity,
      guardrails: brand.guardrails,
    }),
    shortTermMemory: sessionMemory,
    longTermMemory: getEmptyLongTermMemory(),
  };
}
