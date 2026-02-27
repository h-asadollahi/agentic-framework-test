import { task, logger } from "@trigger.dev/sdk/v3";
import { groundingAgent } from "../agents/grounding-agent.js";
import { buildExecutionContext } from "../core/context.js";
import type { GroundingResult } from "../core/types.js";

/**
 * Grounding Task
 *
 * First stage of the guardrail pipeline.
 * Reads soul.md and guardrails to establish brand context.
 */
export const groundTask = task({
  id: "pipeline-ground",
  retry: { maxAttempts: 3 },
  run: async (payload: { userMessage: string; sessionId: string }) => {
    logger.info("Starting grounding phase", { sessionId: payload.sessionId });

    const context = buildExecutionContext(payload.sessionId);
    const result = await groundingAgent.execute(payload.userMessage, context);

    logger.info("Grounding phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    // Parse the agent's JSON output into typed result
    let groundingResult: GroundingResult;
    try {
      const parsed = JSON.parse(result.output as string);
      groundingResult = {
        brandIdentity: parsed.brandIdentity ?? context.brandIdentity,
        guardrails: parsed.guardrails ?? context.guardrails,
        context: {
          ...context,
          brandIdentity: parsed.brandIdentity ?? context.brandIdentity,
          guardrails: parsed.guardrails ?? context.guardrails,
        },
      };
    } catch {
      // If the agent output isn't valid JSON, use the pre-parsed context
      logger.warn("Grounding agent output wasn't valid JSON, using parsed context");
      groundingResult = {
        brandIdentity: context.brandIdentity,
        guardrails: context.guardrails,
        context,
      };
    }

    return groundingResult;
  },
});
