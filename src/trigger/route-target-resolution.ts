import type { LearnedRoute } from "../routing/learned-routes-schema.js";

type IsRegisteredSubAgent = (agentId: string) => boolean;

export type RouteTargetResolution = {
  executionAgentId: string;
  overridden: boolean;
  reason?: string;
};

/**
 * Resolve the final execution agent deterministically from learned-route target.
 *
 * The learned route is the source of truth:
 * - routeType "sub-agent" -> execute its agentId when registered
 * - routeType "api" -> execute api-fetcher when registered
 */
export function resolveExecutionAgentId(
  subtaskAgentId: string,
  learnedRoute: LearnedRoute | null,
  isRegisteredSubAgent: IsRegisteredSubAgent
): RouteTargetResolution {
  if (!isRegisteredSubAgent(subtaskAgentId)) {
    return { executionAgentId: subtaskAgentId, overridden: false };
  }

  if (!learnedRoute) {
    return { executionAgentId: subtaskAgentId, overridden: false };
  }

  if (learnedRoute.routeType === "sub-agent" && learnedRoute.agentId) {
    if (!isRegisteredSubAgent(learnedRoute.agentId)) {
      return { executionAgentId: subtaskAgentId, overridden: false };
    }

    if (learnedRoute.agentId !== subtaskAgentId) {
      return {
        executionAgentId: learnedRoute.agentId,
        overridden: true,
        reason: `learned route "${learnedRoute.id}" targets "${learnedRoute.agentId}"`,
      };
    }

    return { executionAgentId: subtaskAgentId, overridden: false };
  }

  if (learnedRoute.routeType === "api" && isRegisteredSubAgent("api-fetcher")) {
    if (subtaskAgentId !== "api-fetcher") {
      return {
        executionAgentId: "api-fetcher",
        overridden: true,
        reason: `learned route "${learnedRoute.id}" is routeType api`,
      };
    }
  }

  return { executionAgentId: subtaskAgentId, overridden: false };
}
