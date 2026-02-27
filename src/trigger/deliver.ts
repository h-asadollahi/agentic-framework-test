import { task, logger } from "@trigger.dev/sdk/v3";
import { interfaceAgent } from "../agents/interface-agent.js";
import type {
  AgencyResult,
  DeliveryResult,
  ExecutionContext,
} from "../core/types.js";

/**
 * Deliver Task (Interface)
 *
 * Fourth and final stage of the guardrail pipeline.
 * Formats the response for the marketer and determines notifications.
 */
export const deliverTask = task({
  id: "pipeline-deliver",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    agencyResult: AgencyResult;
    context: ExecutionContext;
  }) => {
    logger.info("Starting interface phase");

    const input = JSON.stringify({
      results: payload.agencyResult.results,
      summary: payload.agencyResult.summary,
    });

    const result = await interfaceAgent.execute(input, payload.context);

    logger.info("Interface phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    let deliveryResult: DeliveryResult;
    try {
      deliveryResult = JSON.parse(result.output as string);
    } catch {
      logger.warn("Interface agent output wasn't valid JSON, using raw text");
      deliveryResult = {
        formattedResponse: result.output as string,
        notifications: [],
      };
    }

    return deliveryResult;
  },
});
