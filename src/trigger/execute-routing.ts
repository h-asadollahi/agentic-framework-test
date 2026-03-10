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

const BUILD_SIGNALS = [
  "create",
  "build",
  "implement",
  "design",
  "develop",
  "setup",
  "configure",
  "scaffold",
  "generate",
];

const INTEGRATION_SIGNALS = [
  "mcp",
  "server",
  "integration",
  "tooling",
  "architecture",
  "workflow",
  "framework",
  "skill",
];

export function shouldAttemptRouteLearning(subtask: Pick<SubTask, "agentId" | "description">): boolean {
  const haystack = `${subtask.agentId} ${subtask.description}`.toLowerCase();
  const isBuildIntent = BUILD_SIGNALS.some((signal) => haystack.includes(signal));
  const isIntegrationRequest = INTEGRATION_SIGNALS.some((signal) =>
    haystack.includes(signal)
  );

  if (isBuildIntent && isIntegrationRequest) {
    return false;
  }

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
