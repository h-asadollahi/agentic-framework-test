import { task, logger } from "@trigger.dev/sdk/v3";
import { interfaceAgent } from "../agents/interface-agent.js";
import type {
  AgencyResult,
  AgentResult,
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

const DETERMINISTIC_ROUTE_AGENT_IDS = new Set([
  "mcp-fetcher",
  "api-fetcher",
  "cohort-monitor",
]);

const MAX_INTERFACE_OUTPUT_PREVIEW_CHARS = 700;
const MAX_DETERMINISTIC_FACTS = 8;

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

    let deliveryResult: DeliveryResult;

    if (shouldUseDeterministicDeliverFastPath(payload.agencyResult)) {
      deliveryResult = buildDeterministicDeliveryFastPath(
        payload.agencyResult,
        criticalFacts
      );
      logger.info("Interface phase complete (deterministic fast path)", {
        model: "deterministic-fast-path",
      });
    } else {
      const input = JSON.stringify({
        results: buildCompactInterfacePromptResults(payload.agencyResult.results),
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

type ExecutedSubtaskResult = AgencyResult["results"][number];

export function shouldUseDeterministicDeliverFastPath(
  agencyResult: AgencyResult
): boolean {
  if (!agencyResult.summary || !agencyResult.summary.trim()) return false;
  if (agencyResult.needsHumanReview === true) return false;
  if (!Array.isArray(agencyResult.results) || agencyResult.results.length === 0) {
    return false;
  }
  if (agencyResult.results.some((item) => item.result.success !== true)) {
    return false;
  }

  const deterministicResults = agencyResult.results.filter((item) =>
    DETERMINISTIC_ROUTE_AGENT_IDS.has(item.agentId)
  );
  if (deterministicResults.length !== 1) {
    return false;
  }

  const hasUnsupportedNonDeterministic = agencyResult.results.some((item) => {
    if (DETERMINISTIC_ROUTE_AGENT_IDS.has(item.agentId)) return false;
    return item.result.modelUsed !== "deterministic-skip";
  });

  return !hasUnsupportedNonDeterministic;
}

export function buildDeterministicDeliveryFastPath(
  agencyResult: AgencyResult,
  criticalFacts: string[]
): DeliveryResult {
  const deterministicResult = agencyResult.results.find((item) =>
    DETERMINISTIC_ROUTE_AGENT_IDS.has(item.agentId)
  );
  const sourceLabel = deterministicResult
    ? mapDeterministicSourceLabel(deterministicResult.agentId)
    : "Pipeline data source";
  const executiveSummary = humanizeAgencySummary(agencyResult.summary);
  const keyFindings = selectFactBullets(criticalFacts, executiveSummary);
  const issues = (agencyResult.issues ?? [])
    .map((issue) => normalizeLine(issue))
    .filter(Boolean)
    .slice(0, 5);

  const findings =
    keyFindings.length > 0 ? keyFindings : ["Results were retrieved successfully."];
  const nextStep = issues.length
    ? "Review the listed issues and validate impacted metrics before taking campaign actions."
    : "Use these findings to prioritize the next optimization cycle for the relevant audience segment.";

  const lines = [
    "## Executive Summary",
    executiveSummary,
    "",
    "## Key Findings",
    ...findings.map((fact) => `- ${fact}`),
    "",
    "## Data Source and Time Window",
    `- Source: ${sourceLabel}`,
    "- Time Window: Based on the executed route request context",
    "",
    "## Recommended Next Step",
    nextStep,
  ];

  if (issues.length > 0) {
    lines.push("", "## Detailed Findings", ...issues.map((issue) => `- ${issue}`));
  }

  return {
    formattedResponse: lines.join("\n"),
    notifications: [],
  };
}

function mapDeterministicSourceLabel(agentId: string): string {
  if (agentId === "mcp-fetcher") return "Mapp Intelligence MCP server";
  if (agentId === "api-fetcher") return "Analytics API route";
  if (agentId === "cohort-monitor") return "Cohort monitor service";
  return "Pipeline data source";
}

function humanizeAgencySummary(summary: string): string {
  const normalized = normalizeLine(summary);
  const deterministicMatch = normalized.match(
    /^Deterministic fast path:\s*(.+?)\s*completed via\s*[a-z0-9-]+(?:\s+in\s+\d+ms.*)?\.?$/i
  );
  if (deterministicMatch?.[1]) {
    return `${normalizeLine(deterministicMatch[1])} completed successfully.`;
  }
  return normalized;
}

function selectFactBullets(facts: string[], summary: string): string[] {
  const normalizedSummary = normalizeLine(summary).toLowerCase();
  const normalized = facts
    .map((fact) => normalizeLine(fact))
    .filter(Boolean)
    .filter((fact) => fact.toLowerCase() !== normalizedSummary)
    .filter((fact) => !fact.toLowerCase().includes("deterministic fast path:"))
    .filter((fact) => !looksLikeRawJson(fact))
    .slice(0, MAX_DETERMINISTIC_FACTS);

  return Array.from(new Set(normalized)).slice(0, MAX_DETERMINISTIC_FACTS);
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeRawJson(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.includes("\":")) ||
    (trimmed.startsWith("[") && trimmed.includes("{"))
  );
}

function buildCompactInterfacePromptResults(results: ExecutedSubtaskResult[]): unknown[] {
  return results.map((item) => ({
    subtaskId: item.subtaskId,
    agentId: item.agentId,
    success: item.result.success,
    modelUsed: item.result.modelUsed,
    durationMs: item.result.durationMs,
    outputPreview: summarizeAgentOutput(item.result),
  }));
}

function summarizeAgentOutput(result: AgentResult): string {
  if (typeof result.output === "string") {
    return compactString(result.output);
  }

  if (result.output && typeof result.output === "object") {
    try {
      return compactString(JSON.stringify(result.output));
    } catch {
      return "[non-serializable object output]";
    }
  }

  return compactString(String(result.output ?? ""));
}

function compactString(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_INTERFACE_OUTPUT_PREVIEW_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_INTERFACE_OUTPUT_PREVIEW_CHARS)}... [truncated]`;
}
