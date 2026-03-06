import { task, logger } from "@trigger.dev/sdk/v3";
import { cognitionAgent } from "../agents/cognition-agent.js";
import type { CognitionResult, GroundingResult } from "../core/types.js";

/**
 * Think Task (Cognition)
 *
 * Second stage of the guardrail pipeline.
 * Decomposes the user's request into an executable subtask plan.
 */
export const thinkTask = task({
  id: "pipeline-think",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    userMessage: string;
    groundingResult: GroundingResult;
  }) => {
    logger.info("Starting cognition phase");

    const context = payload.groundingResult.context;

    const input = JSON.stringify({
      userMessage: payload.userMessage,
      brandIdentity: payload.groundingResult.brandIdentity,
      guardrails: payload.groundingResult.guardrails,
    });

    const result = await cognitionAgent.execute(input, context);

    logger.info("Cognition phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    // Parse the plan
    let cognitionResult: CognitionResult;
    try {
      cognitionResult = JSON.parse(result.output as string);
    } catch {
      logger.warn("Cognition agent output wasn't valid JSON, creating default plan");
      cognitionResult = {
        subtasks: [
          {
            id: "task-1",
            agentId: "general",
            description: payload.userMessage,
            input: {},
            dependencies: [],
            priority: "medium",
          },
        ],
        reasoning: "Could not parse agent output, falling back to single general task",
        plan: payload.userMessage,
      };
    }

    logger.info(`Cognition produced ${cognitionResult.subtasks.length} subtasks`);
    return cognitionResult;
  },
});
