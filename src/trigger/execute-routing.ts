import type { SubTask } from "../core/types.js";

export type UnknownSubtaskStrategy =
  | "use-learned-route"
  | "learn-new-route"
  | "llm-fallback";

const DATA_SIGNALS = [
  "api",
  "endpoint",
  "fetch",
  "data",
  "metrics",
  "report",
  "analytics",
  "dashboard",
  "cohort",
  "conversion",
  "retention",
  "churn",
];

export function shouldAttemptRouteLearning(subtask: Pick<SubTask, "agentId" | "description">): boolean {
  const haystack = `${subtask.agentId} ${subtask.description}`.toLowerCase();
  return DATA_SIGNALS.some((signal) => haystack.includes(signal));
}

export function resolveUnknownSubtaskStrategy(
  subtask: Pick<SubTask, "agentId" | "description">,
  hasLearnedRoute: boolean
): UnknownSubtaskStrategy {
  if (hasLearnedRoute) {
    return "use-learned-route";
  }

  if (shouldAttemptRouteLearning(subtask)) {
    return "learn-new-route";
  }

  return "llm-fallback";
}
