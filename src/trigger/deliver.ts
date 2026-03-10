import { task, logger } from "@trigger.dev/sdk/v3";
import { interfaceAgent } from "../agents/interface-agent.js";
import type {
  AgencyResult,
  CognitionResult,
  DeliveryResult,
  ExecutionContext,
} from "../core/types.js";
import {
  ensureMarketerHumanReviewSlackNotification,
  ensureMarketerMonitoringSlackNotification,
  ensureHumanReviewSlackNotification,
  ensureMonitoringSlackNotification,
  normalizeSlackNotificationRecipients,
} from "./deliver-notifications.js";
import { parseAgentJson } from "./agent-output-parser.js";
import {
  buildHumanReadableRenderRequirements,
  enforceCriticalFactsInResponse,
  extractCriticalFacts,
} from "./delivery-fidelity.js";

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
    cognitionResult?: CognitionResult;
    context: ExecutionContext;
  }) => {
    logger.info("Starting interface phase");

    const criticalFacts = extractCriticalFacts(payload.agencyResult);
    const renderRequirements = buildHumanReadableRenderRequirements(
      payload.context.guardrails,
      payload.cognitionResult
    );

    const input = JSON.stringify({
      results: payload.agencyResult.results,
      summary: payload.agencyResult.summary,
      issues: payload.agencyResult.issues ?? [],
      needsHumanReview: payload.agencyResult.needsHumanReview ?? false,
      criticalFacts,
      renderRequirements,
      cognition: payload.cognitionResult
        ? {
            reasoning: payload.cognitionResult.reasoning,
            plan: payload.cognitionResult.plan,
          }
        : null,
    });

    const result = await interfaceAgent.execute(input, payload.context);

    logger.info("Interface phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    let deliveryResult: DeliveryResult;
    const parsedDelivery = parseAgentJson<DeliveryResult>(result.output);
    if (parsedDelivery) {
      deliveryResult = parsedDelivery;
    } else {
      logger.warn("Interface agent output wasn't valid JSON, using raw text");
      deliveryResult = {
        formattedResponse: result.output as string,
        notifications: [],
      };
    }

    deliveryResult.notifications = normalizeSlackNotificationRecipients(
      payload.agencyResult,
      deliveryResult.notifications ?? []
    );

    deliveryResult.formattedResponse = enforceCriticalFactsInResponse(
      String(deliveryResult.formattedResponse ?? ""),
      criticalFacts
    );

    deliveryResult.notifications = ensureHumanReviewSlackNotification(
      payload.agencyResult,
      deliveryResult.notifications ?? []
    );
    deliveryResult.notifications = ensureMarketerHumanReviewSlackNotification(
      payload.agencyResult,
      deliveryResult.notifications ?? []
    );
    deliveryResult.notifications = ensureMonitoringSlackNotification(
      payload.agencyResult,
      deliveryResult.notifications ?? []
    );
    deliveryResult.notifications = ensureMarketerMonitoringSlackNotification(
      payload.agencyResult,
      deliveryResult.notifications ?? []
    );

    return deliveryResult;
  },
});
