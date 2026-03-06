import { task, logger } from "@trigger.dev/sdk/v3";
import { cognitionAgent } from "../agents/cognition-agent.js";
import type { CognitionResult, GroundingResult } from "../core/types.js";
import {
  isCohortOrientedSubtask,
  deriveCohortInputFromText,
} from "./execute-routing.js";

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
      const fallbackAgentId = isCohortOrientedSubtask({
        agentId: "general",
        description: payload.userMessage,
      })
        ? "cohort-monitor"
        : "general";

      logger.warn("Cognition agent output wasn't valid JSON, creating default plan");
      cognitionResult = {
        subtasks: [
          {
            id: "task-1",
            agentId: fallbackAgentId,
            description: payload.userMessage,
            input:
              fallbackAgentId === "cohort-monitor"
                ? deriveCohortInputFromText(payload.userMessage)
                : {},
            dependencies: [],
            priority: "medium",
          },
        ],
        reasoning:
          fallbackAgentId === "cohort-monitor"
            ? "Could not parse agent output, falling back to single cohort-monitor task"
            : "Could not parse agent output, falling back to single general task",
        plan: payload.userMessage,
      };
    }

    logger.info(`Cognition produced ${cognitionResult.subtasks.length} subtasks`);
    return cognitionResult;
  },
});
