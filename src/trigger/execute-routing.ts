import type { SubTask } from "../core/types.js";

export type UnknownSubtaskStrategy =
  | "use-learned-route"
  | "learn-new-route"
  | "llm-fallback";

export type UnknownSubtaskStrategyOptions = {
  hasDeterministicRouteContext?: boolean;
};

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

const SYNTHESIS_SIGNALS = [
  "summarize",
  "summary",
  "synthesize",
  "consolidate",
  "rollup",
  "roll-up",
  "aggregate",
  "narrative",
  "insight",
  "recommendation",
  "combine",
  "compile",
  "final answer",
  "normalize",
  "present",
  "presentation",
  "readable",
  "scannable",
  "grouped",
  "group by",
  "de-duplicated",
  "deduplicated",
  "de-duplicate",
  "deduplicate",
  "structured",
  "format",
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

function isGeneralAgent(agentId: string): boolean {
  const normalized = agentId.trim().toLowerCase();
  return normalized === "general" || normalized === "assistant";
}

export function isSynthesisLikeDescription(description: string): boolean {
  const lower = description.toLowerCase();
  if (SYNTHESIS_SIGNALS.some((signal) => lower.includes(signal))) {
    return true;
  }

  // Common cognition output style for synthesis subtasks.
  return /\b(single|final)\s+(narrative|report|summary)\b/.test(lower);
}

export function shouldAttemptRouteLearning(subtask: Pick<SubTask, "agentId" | "description">): boolean {
  const haystack = `${subtask.agentId} ${subtask.description}`.toLowerCase();
  const isBuildIntent = BUILD_SIGNALS.some((signal) => haystack.includes(signal));
  const isIntegrationRequest = INTEGRATION_SIGNALS.some((signal) =>
    haystack.includes(signal)
  );
  const isSynthesisIntent =
    isGeneralAgent(subtask.agentId) &&
    isSynthesisLikeDescription(subtask.description);

  if (isBuildIntent && isIntegrationRequest) {
    return false;
  }

  if (isSynthesisIntent) {
    return false;
  }

  return DATA_SIGNALS.some((signal) => haystack.includes(signal));
}

export function resolveUnknownSubtaskStrategy(
  subtask: Pick<SubTask, "agentId" | "description">,
  hasLearnedRoute: boolean,
  options: UnknownSubtaskStrategyOptions = {}
): UnknownSubtaskStrategy {
  if (hasLearnedRoute) {
    return "use-learned-route";
  }

  if (
    options.hasDeterministicRouteContext &&
    isGeneralAgent(subtask.agentId) &&
    isSynthesisLikeDescription(subtask.description)
  ) {
    return "llm-fallback";
  }

  if (shouldAttemptRouteLearning(subtask)) {
    return "learn-new-route";
  }

  return "llm-fallback";
}
