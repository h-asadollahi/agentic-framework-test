import type { SubTask } from "../core/types.js";

export type UnknownSubtaskStrategy =
  | "use-cohort-monitor"
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

const COHORT_SIGNALS = [
  "cohort",
  "vip",
  "premium",
  "retention",
  "churn",
  "ltv",
  "lifetime value",
  "segment",
];

const METRIC_BY_SIGNAL: Array<{ signal: string; metric: "engagement" | "retention" | "conversion" | "churn" | "ltv" }> = [
  { signal: "retention", metric: "retention" },
  { signal: "conversion", metric: "conversion" },
  { signal: "churn", metric: "churn" },
  { signal: "ltv", metric: "ltv" },
  { signal: "lifetime value", metric: "ltv" },
  { signal: "engagement", metric: "engagement" },
];

export function shouldAttemptRouteLearning(subtask: Pick<SubTask, "agentId" | "description">): boolean {
  const haystack = `${subtask.agentId} ${subtask.description}`.toLowerCase();
  return DATA_SIGNALS.some((signal) => haystack.includes(signal));
}

export function isCohortOrientedSubtask(subtask: Pick<SubTask, "agentId" | "description">): boolean {
  const haystack = `${subtask.agentId} ${subtask.description}`.toLowerCase();
  return COHORT_SIGNALS.some((signal) => haystack.includes(signal));
}

export function deriveCohortInputFromText(text: string): {
  cohortId?: string;
  metric?: "engagement" | "retention" | "conversion" | "churn" | "ltv";
  timeRange?: "7d" | "30d" | "90d" | "ytd";
  compareBaseline: boolean;
} {
  const lower = text.toLowerCase();
  const metric =
    METRIC_BY_SIGNAL.find((entry) => lower.includes(entry.signal))?.metric ??
    "engagement";

  let timeRange: "7d" | "30d" | "90d" | "ytd" = "30d";
  if (lower.includes("quarter") || lower.includes("90d")) timeRange = "90d";
  if (lower.includes("year") || lower.includes("ytd")) timeRange = "ytd";
  if (lower.includes("week") || lower.includes("7d")) timeRange = "7d";

  let cohortId: string | undefined;
  if (lower.includes("vip")) cohortId = "vip";
  else if (lower.includes("premium")) cohortId = "premium";
  else if (lower.includes("at-risk")) cohortId = "at-risk";

  return {
    cohortId,
    metric,
    timeRange,
    compareBaseline: true,
  };
}

export function resolveUnknownSubtaskStrategy(
  subtask: Pick<SubTask, "agentId" | "description">,
  hasCohortMonitor: boolean,
  hasLearnedRoute: boolean
): UnknownSubtaskStrategy {
  if (hasCohortMonitor && isCohortOrientedSubtask(subtask)) {
    return "use-cohort-monitor";
  }

  if (hasLearnedRoute) {
    return "use-learned-route";
  }

  if (shouldAttemptRouteLearning(subtask)) {
    return "learn-new-route";
  }

  return "llm-fallback";
}
