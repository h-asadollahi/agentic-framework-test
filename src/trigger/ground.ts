import { task, logger } from "@trigger.dev/sdk/v3";
import { groundingAgent } from "../agents/grounding-agent.js";
import { buildExecutionContext } from "../core/context.js";
import type { ExecutionContext, GroundingResult } from "../core/types.js";
import { withRunId } from "../core/request-context.js";
import { parseAgentJson } from "./agent-output-parser.js";

type GroundingOutputPayload = Partial<
  Pick<GroundingResult, "brandIdentity" | "guardrails">
>;

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
        context,
      },
    };
  }

  const brandIdentity = parsed.brandIdentity ?? context.brandIdentity;
  const guardrails = parsed.guardrails ?? context.guardrails;

  return {
    parsedJson: true,
    groundingResult: {
      brandIdentity,
      guardrails,
      context: {
        ...context,
        brandIdentity,
        guardrails,
      },
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

    const context = await buildExecutionContext(
      payload.sessionId,
      withRunId(payload.requestContext, taskContext.ctx.run.id)
    );
    const result = await groundingAgent.execute(payload.userMessage, context);

    logger.info("Grounding phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    const { groundingResult, parsedJson } = buildGroundingResultFromOutput(
      result.output,
      context
    );

    if (!parsedJson) {
      // If the agent output isn't valid JSON, use the pre-parsed context
      logger.warn("Grounding agent output wasn't valid JSON, using parsed context");
    }

    return groundingResult;
  },
});
