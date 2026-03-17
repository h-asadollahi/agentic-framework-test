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
  "token-usage-monitor",
]);

const MAX_INTERFACE_OUTPUT_PREVIEW_CHARS = 700;
const MAX_DETERMINISTIC_FACTS = 8;
const MAX_CATALOG_GROUPS = 6;
const MAX_CATALOG_GROUP_SAMPLES = 3;
const MAX_CATALOG_ALPHA_SAMPLES = 10;

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
type JsonRecord = Record<string, unknown>;

interface DimensionMetricCatalogPayload {
  serverName?: string;
  toolName: "list_dimensions_and_metrics";
  dimensionsCount: number;
  metricsCount: number;
  dimensions: string[];
  metrics: string[];
  executedAt?: string;
}

interface TokenUsageMonitorPayload {
  audience: "admin" | "marketer";
  brandId: string | null;
  days: number;
  bucket: "day";
  totalPrompts: number;
  totalLlmCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCalls: number;
  byProvider: Array<{ provider: string; tokens: number; calls: number }>;
  byModel: Array<{ model: string; tokens: number; calls: number }>;
  daily: Array<{
    bucket: string;
    promptCount: number;
    llmCallCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokens: number;
    calls: number;
  }>;
  note?: string;
}

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
  const catalogRender = deterministicResult
    ? buildDimensionMetricCatalogFastPath(
        agencyResult,
        deterministicResult,
        criticalFacts
      )
    : null;
  if (catalogRender) {
    return catalogRender;
  }

  const tokenUsageRender = deterministicResult
    ? buildTokenUsageMonitorFastPath(agencyResult, deterministicResult)
    : null;
  if (tokenUsageRender) {
    return tokenUsageRender;
  }

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

function buildDimensionMetricCatalogFastPath(
  agencyResult: AgencyResult,
  deterministicResult: ExecutedSubtaskResult,
  criticalFacts: string[]
): DeliveryResult | null {
  const catalog = extractDimensionMetricCatalogPayload(
    deterministicResult.result.output
  );
  if (!catalog) return null;

  const sourceLabel = mapDeterministicSourceLabel(deterministicResult.agentId);
  const executiveSummary =
    `Retrieved the Mapp Intelligence catalog successfully, including ` +
    `${formatCount(catalog.dimensionsCount)} dimensions and ` +
    `${formatCount(catalog.metricsCount)} metrics.`;
  const supplementalFindings = selectFactBullets(criticalFacts, executiveSummary)
    .filter((fact) => !fact.toLowerCase().includes("results were retrieved successfully"))
    .slice(0, 4);
  const issues = (agencyResult.issues ?? [])
    .map((issue) => normalizeLine(issue))
    .filter(Boolean)
    .slice(0, 5);

  const lines = [
    "## Executive Summary",
    executiveSummary,
    "",
    "## Key Findings",
    `- Total dimensions available: ${formatCount(catalog.dimensionsCount)}`,
    `- Total metrics available: ${formatCount(catalog.metricsCount)}`,
    ...supplementalFindings.map((fact) => `- ${fact}`),
    "",
    "## Dimension Snapshot",
    ...buildCatalogPreviewLines(catalog.dimensions, "dimensions"),
    "",
    "## Metric Snapshot",
    ...buildCatalogPreviewLines(catalog.metrics, "metrics"),
    "",
    "## Data Source and Time Window",
    `- Source: ${buildCatalogSourceLabel(sourceLabel, catalog.serverName)}`,
    "- Time Window: Not applicable for catalog metadata requests",
    "",
    "## Recommended Next Step",
    "Use these grouped samples to confirm naming conventions, then inspect the full payload in the admin/demo trace if you need the complete catalog.",
  ];

  if (issues.length > 0) {
    lines.push("", "## Detailed Findings", ...issues.map((issue) => `- ${issue}`));
  }

  return {
    formattedResponse: lines.join("\n"),
    notifications: [],
  };
}

function buildTokenUsageMonitorFastPath(
  agencyResult: AgencyResult,
  deterministicResult: ExecutedSubtaskResult
): DeliveryResult | null {
  const usage = extractTokenUsageMonitorPayload(deterministicResult.result.output);
  if (!usage) return null;

  const audienceLabel =
    usage.audience === "admin" ? "admins" : "marketers";
  const scopeLabel = usage.brandId
    ? `for brand \`${usage.brandId}\``
    : "across all tracked brands";
  const providerLines =
    usage.byProvider.length > 0
      ? usage.byProvider.slice(0, 5).map(
          (entry) =>
            `- \`${entry.provider}\`: ${formatCount(entry.tokens)} tokens across ${formatCount(entry.calls)} calls`
        )
      : ["- No provider usage has been tracked for this window yet."];
  const modelLines =
    usage.byModel.length > 0
      ? usage.byModel.slice(0, 6).map(
          (entry) =>
            `- \`${entry.model}\`: ${formatCount(entry.tokens)} tokens across ${formatCount(entry.calls)} calls`
        )
      : ["- No model usage has been tracked for this window yet."];
  const dailyLines =
    usage.daily.length > 0
      ? usage.daily.map(
          (entry) =>
            `- ${entry.bucket}: ${formatCount(entry.totalTokens)} total tokens (${formatCount(entry.inputTokens)} input, ${formatCount(entry.outputTokens)} output) across ${formatCount(entry.promptCount)} prompts and ${formatCount(entry.llmCallCount)} LLM calls`
        )
      : ["- No daily usage has been tracked for this window yet."];

  return {
    formattedResponse: [
      "## Executive Summary",
      `Tracked ${formatCount(usage.totalTokens)} total tokens across ${formatCount(usage.totalPrompts)} prompts and ${formatCount(usage.totalLlmCalls)} LLM calls for ${audienceLabel} ${scopeLabel} over the last ${formatCount(usage.days)} days.`,
      "",
      "## Key Findings",
      `- Audience filter: ${usage.audience}`,
      `- Brand filter: ${usage.brandId ?? "all brands"}`,
      `- Total prompts: ${formatCount(usage.totalPrompts)}`,
      `- Total input tokens: ${formatCount(usage.totalInputTokens)}`,
      `- Total output tokens: ${formatCount(usage.totalOutputTokens)}`,
      `- Total tokens: ${formatCount(usage.totalTokens)}`,
      `- Total LLM calls: ${formatCount(usage.totalLlmCalls)}`,
      "",
      "## Daily Breakdown",
      ...dailyLines,
      "",
      "## Provider Totals",
      ...providerLines,
      "",
      "## Model Totals",
      ...modelLines,
      "",
      "## Recommended Next Step",
      usage.note ??
        "Compare the top providers and models against your expected traffic mix, then drill into the admin trace or telemetry endpoints if you need more detail.",
    ].join("\n"),
    notifications: [],
  };
}

function mapDeterministicSourceLabel(agentId: string): string {
  if (agentId === "mcp-fetcher") return "Mapp Intelligence MCP server";
  if (agentId === "api-fetcher") return "Analytics API route";
  if (agentId === "cohort-monitor") return "Cohort monitor service";
  if (agentId === "token-usage-monitor") return "LLM telemetry store";
  return "Pipeline data source";
}

function buildCatalogSourceLabel(sourceLabel: string, serverName?: string): string {
  if (!serverName) return sourceLabel;
  return `${sourceLabel} (${serverName})`;
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

function extractDimensionMetricCatalogPayload(
  output: unknown
): DimensionMetricCatalogPayload | null {
  const parsed = parseStructuredOutput(output);
  if (!parsed) return null;
  if (parsed.toolName !== "list_dimensions_and_metrics") return null;

  const data = asRecord(parsed.data);
  if (!data) return null;

  const dimensions = asStringArray(data.dimensions);
  const metrics = asStringArray(data.metrics);
  const dimensionsCount = asNumber(data.dimensionsCount) ?? dimensions.length;
  const metricsCount = asNumber(data.metricsCount) ?? metrics.length;

  if (dimensions.length === 0 && metrics.length === 0) {
    return null;
  }

  return {
    serverName: typeof parsed.serverName === "string" ? parsed.serverName : undefined,
    toolName: "list_dimensions_and_metrics",
    dimensionsCount,
    metricsCount,
    dimensions,
    metrics,
    executedAt: typeof parsed.executedAt === "string" ? parsed.executedAt : undefined,
  };
}

function extractTokenUsageMonitorPayload(
  output: unknown
): TokenUsageMonitorPayload | null {
  const parsed = parseStructuredOutput(output);
  if (!parsed) return null;

  const audience =
    parsed.audience === "admin" || parsed.audience === "marketer"
      ? parsed.audience
      : null;
  const days = asNumber(parsed.days);
  const totalPrompts = asNumber(parsed.totalPrompts);
  const totalLlmCalls = asNumber(parsed.totalLlmCalls ?? parsed.totalCalls);
  const totalInputTokens = asNumber(parsed.totalInputTokens);
  const totalOutputTokens = asNumber(parsed.totalOutputTokens);
  const totalTokens = asNumber(parsed.totalTokens);
  const totalCalls = asNumber(parsed.totalCalls ?? parsed.totalLlmCalls);
  if (
    !audience ||
    days === null ||
    totalPrompts === null ||
    totalLlmCalls === null ||
    totalInputTokens === null ||
    totalOutputTokens === null ||
    totalTokens === null ||
    totalCalls === null
  ) {
    return null;
  }

  return {
    audience,
    brandId: typeof parsed.brandId === "string" ? parsed.brandId : null,
    days,
    bucket: parsed.bucket === "day" ? "day" : "day",
    totalPrompts,
    totalLlmCalls,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalCalls,
    byProvider: asProviderUsageBreakdownArray(parsed.byProvider),
    byModel: asModelUsageBreakdownArray(parsed.byModel),
    daily: asDailyUsageArray(parsed.daily),
    note: typeof parsed.note === "string" ? parsed.note : undefined,
  };
}

function parseStructuredOutput(output: unknown): JsonRecord | null {
  if (typeof output === "string") {
    try {
      return asRecord(JSON.parse(output));
    } catch {
      return null;
    }
  }

  return asRecord(output);
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeLine(item))
    .filter(Boolean);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

function asProviderUsageBreakdownArray(
  value: unknown
): Array<{ provider: string; tokens: number; calls: number }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const label = typeof record.provider === "string" ? record.provider : null;
      const tokens = asNumber(record.tokens);
      const calls = asNumber(record.calls);
      if (!label || tokens === null || calls === null) {
        return null;
      }
      return { provider: label, tokens, calls };
    })
    .filter((item): item is { provider: string; tokens: number; calls: number } => Boolean(item));
}

function asModelUsageBreakdownArray(
  value: unknown
): Array<{ model: string; tokens: number; calls: number }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const label = typeof record.model === "string" ? record.model : null;
      const tokens = asNumber(record.tokens);
      const calls = asNumber(record.calls);
      if (!label || tokens === null || calls === null) {
        return null;
      }
      return { model: label, tokens, calls };
    })
    .filter((item): item is { model: string; tokens: number; calls: number } => Boolean(item));
}

function asDailyUsageArray(
  value: unknown
): Array<{
  bucket: string;
  promptCount: number;
  llmCallCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokens: number;
  calls: number;
}> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const bucket = typeof record.bucket === "string" ? record.bucket : null;
      const promptCount = asNumber(record.promptCount);
      const llmCallCount = asNumber(record.llmCallCount ?? record.calls);
      const inputTokens = asNumber(record.inputTokens);
      const outputTokens = asNumber(record.outputTokens);
      const totalTokens = asNumber(record.totalTokens ?? record.tokens);
      const tokens = asNumber(record.tokens ?? record.totalTokens);
      const calls = asNumber(record.calls ?? record.llmCallCount);
      if (
        !bucket ||
        promptCount === null ||
        llmCallCount === null ||
        inputTokens === null ||
        outputTokens === null ||
        totalTokens === null ||
        tokens === null ||
        calls === null
      ) {
        return null;
      }
      return {
        bucket,
        promptCount,
        llmCallCount,
        inputTokens,
        outputTokens,
        totalTokens,
        tokens,
        calls,
      };
    })
    .filter((item): item is {
      bucket: string;
      promptCount: number;
      llmCallCount: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      tokens: number;
      calls: number;
    } => Boolean(item));
}

function buildCatalogPreviewLines(
  names: string[],
  label: "dimensions" | "metrics"
): string[] {
  const uniqueNames = Array.from(
    new Set(names.map((name) => normalizeLine(name)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  if (uniqueNames.length === 0) {
    return [`- No ${label} were returned.`];
  }

  const grouped = groupCatalogNames(uniqueNames).filter(([, items]) => items.length > 1);
  if (grouped.length < 2) {
    return [buildAlphabeticalCatalogSample(uniqueNames)];
  }

  const displayedGroups = grouped.slice(0, MAX_CATALOG_GROUPS);
  const coveredNames = displayedGroups.reduce((sum, [, items]) => sum + items.length, 0);
  const lines = displayedGroups.map(([family, items]) =>
    formatCatalogGroupLine(family, items)
  );
  const remaining = uniqueNames.length - coveredNames;

  if (remaining > 0) {
    lines.push(`- Plus ${formatCount(remaining)} more ${label} across additional families.`);
  }

  return lines;
}

function buildAlphabeticalCatalogSample(names: string[]): string {
  const sample = names.slice(0, MAX_CATALOG_ALPHA_SAMPLES).map((name) => `\`${name}\``);
  const remaining = names.length - sample.length;
  const suffix = remaining > 0 ? `, and ${formatCount(remaining)} more.` : ".";
  return `- Alphabetical sample: ${sample.join(", ")}${suffix}`;
}

function groupCatalogNames(names: string[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();

  for (const name of names) {
    const family = inferCatalogFamily(name);
    const existing = groups.get(family) ?? [];
    existing.push(name);
    groups.set(family, existing);
  }

  return [...groups.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) {
      return b[1].length - a[1].length;
    }
    return a[0].localeCompare(b[0]);
  });
}

function inferCatalogFamily(name: string): string {
  const parts = name.split(/[_:.\-\s]+/).filter(Boolean);
  const first = parts[0]?.toLowerCase();
  return first && first.length > 1 ? first : "other";
}

function formatCatalogGroupLine(family: string, items: string[]): string {
  const sample = items
    .slice(0, MAX_CATALOG_GROUP_SAMPLES)
    .map((name) => `\`${name}\``)
    .join(", ");
  const remaining = items.length - MAX_CATALOG_GROUP_SAMPLES;
  const suffix = remaining > 0 ? `, and ${formatCount(remaining)} more` : "";
  return `- \`${family}\` (${formatCount(items.length)}): ${sample}${suffix}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
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
