import { task, logger } from "@trigger.dev/sdk/v3";
import { groundingAgent } from "../agents/grounding-agent.js";
import { buildExecutionContext } from "../core/context.js";
import type { ExecutionContext, GroundingResult } from "../core/types.js";
import { withRunId } from "../core/request-context.js";
import { parseAgentJson } from "./agent-output-parser.js";
import { agentAuditStore } from "../observability/agent-audit-store.js";
import { buildBrandContractSummary, createBrandContract } from "../core/brand-contract.js";

type GroundingOutputPayload = Partial<
  Pick<GroundingResult, "summary">
>;

const GROUNDING_INTERPRETATION_PATTERNS = [
  /\bwhy\b/i,
  /\bexplain\b/i,
  /\bconflict\b/i,
  /\bexception\b/i,
  /\ballowed\b/i,
  /\bforbidden\b/i,
  /\bcan we\b/i,
  /\bshould we\b/i,
  /\bwithin brand\b/i,
];

export function shouldUseDeterministicGrounding(
  userMessage: string,
  context: ExecutionContext
): boolean {
  if (context.requestContext.audience === "admin") return true;
  if (process.env.GROUNDING_FORCE_LLM?.toLowerCase() === "true") return false;
  return !GROUNDING_INTERPRETATION_PATTERNS.some((pattern) =>
    pattern.test(userMessage)
  );
}

export function buildDeterministicGroundingSummary(
  context: ExecutionContext
): string {
  return [
    `Brand contract for ${context.brandIdentity.name} is active.`,
    `Voice: ${context.brandIdentity.voice.tone}, ${context.brandIdentity.voice.style}.`,
    `Always do: ${context.guardrails.alwaysDo.slice(0, 3).join("; ") || "none"}.`,
    `Never do: ${context.guardrails.neverDo.slice(0, 3).join("; ") || "none"}.`,
  ].join(" ");
}

export function buildGroundingResultFromOutput(
  output: unknown,
  context: ExecutionContext
): { groundingResult: GroundingResult; parsedJson: boolean } {
  const parsed = parseAgentJson<GroundingOutputPayload>(output);

  if (!parsed) {
    return {
      parsedJson: false,
      groundingResult: {
        brandIdentity: context.brandIdentity,
        guardrails: context.guardrails,
        summary: buildDeterministicGroundingSummary(context),
        context,
      },
    };
  }

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary.trim()
      : buildDeterministicGroundingSummary(context);
  return {
    parsedJson: true,
    groundingResult: {
      brandIdentity: context.brandIdentity,
      guardrails: context.guardrails,
      summary,
      context,
    },
  };
}

/**
 * Grounding Task
 *
 * First stage of the guardrail pipeline.
 * Reads knowledge/soul.md and guardrails to establish brand context.
 */
export const groundTask = task({
  id: "pipeline-ground",
  retry: { maxAttempts: 3 },
  run: async (
    payload: { userMessage: string; sessionId: string; requestContext: ExecutionContext["requestContext"] },
    taskContext
  ) => {
    logger.info("Starting grounding phase", { sessionId: payload.sessionId });
    const requestContext = withRunId(payload.requestContext, taskContext.ctx.run.id);
    const auditBase = {
      pipelineRunId: requestContext.pipelineRunId ?? payload.sessionId,
      runId: taskContext.ctx.run.id,
      sessionId: payload.sessionId,
      phase: "grounding",
      componentKind: "task" as const,
      componentId: "pipeline-ground",
      audience: requestContext.audience,
      scope: requestContext.scope,
      brandId: requestContext.brandId,
    };

    await agentAuditStore.record({
      ...auditBase,
      eventType: "invoke",
      status: "running",
      payload: {
        userMessage: payload.userMessage,
      },
    });

    const context = await buildExecutionContext(
      payload.sessionId,
      requestContext
    );

    if (shouldUseDeterministicGrounding(payload.userMessage, context)) {
      const summary = buildDeterministicGroundingSummary(context);
      logger.info("Grounding deterministic fast path activated", {
        brandId: requestContext.brandId,
        brandContractVersion: context.brandContract.version,
      });
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "completed",
        payload: {
          decision: "deterministic-grounding-fast-path",
          brandContractVersion: context.brandContract.version,
          brandContractHash: context.brandContract.hash,
          summary,
        },
      });
      await agentAuditStore.record({
        ...auditBase,
        eventType: "result",
        status: "completed",
        payload: {
          parsedJson: false,
          mode: "deterministic",
          summary,
          brandName: context.brandIdentity.name,
          brandContractSummary: buildBrandContractSummary(context.brandContract),
          guardrailCounts: {
            neverDo: context.guardrails.neverDo.length,
            alwaysDo: context.guardrails.alwaysDo.length,
            brandVoiceRules: context.guardrails.brandVoiceRules.length,
            contentPolicies: context.guardrails.contentPolicies.length,
          },
        },
      });
      return {
        brandIdentity: context.brandIdentity,
        guardrails: context.guardrails,
        summary,
        context,
      };
    }

    const result = await groundingAgent.execute(payload.userMessage, context);

    logger.info("Grounding phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    const { groundingResult, parsedJson } = buildGroundingResultFromOutput(
      result.output,
      context
    );

    const brandContract = createBrandContract({
      brandId: requestContext.brandId,
      audience: requestContext.audience,
      scope: requestContext.scope,
      brandIdentity: groundingResult.brandIdentity,
      guardrails: groundingResult.guardrails,
    });
    groundingResult.context = {
      ...groundingResult.context,
      brandIdentity: groundingResult.brandIdentity,
      guardrails: groundingResult.guardrails,
      brandContract,
    };

    if (!parsedJson) {
      // If the agent output isn't valid JSON, use the pre-parsed context
      logger.warn("Grounding agent output wasn't valid JSON, using parsed context");
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "warning",
        payload: {
          decision: "grounding-output-fallback",
          reason: "Agent output was not valid JSON; using parsed execution context.",
        },
      });
    }

    await agentAuditStore.record({
      ...auditBase,
      eventType: "result",
      status: "completed",
        payload: {
          parsedJson,
          summary: groundingResult.summary,
          brandName: groundingResult.brandIdentity.name,
          brandContractVersion: groundingResult.context.brandContract.version,
          guardrailCounts: {
            neverDo: groundingResult.guardrails.neverDo.length,
            alwaysDo: groundingResult.guardrails.alwaysDo.length,
          brandVoiceRules: groundingResult.guardrails.brandVoiceRules.length,
          contentPolicies: groundingResult.guardrails.contentPolicies.length,
        },
      },
    });

    return groundingResult;
  },
});
