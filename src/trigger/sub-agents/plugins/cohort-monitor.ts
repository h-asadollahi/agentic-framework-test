import { z } from "zod";
import { type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext, AgentResult } from "../../../core/types.js";
import { getMockCohortData, getMockCohortOverview } from "./cohort-monitor-mock.js";
import { logger } from "../../../core/logger.js";
import { loadAgentPromptSpec, resolveAgentPromptSpec } from "../../../tools/agent-spec-loader.js";
import { agentAuditStore } from "../../../observability/agent-audit-store.js";

// ── Schemas ────────────────────────────────────────────────────
// All fields are OPTIONAL with sensible defaults so the cognition
// agent can pass partial / free-form input without validation errors.

const CohortMonitorInput = z
  .object({
    cohortId: z
      .string()
      .optional()
      .default("default-cohort")
      .describe("Specific cohort ID to analyze (e.g. 'vip-2024-q4')"),
    metric: z
      .enum(["engagement", "retention", "conversion", "churn", "ltv"])
      .optional()
      .default("engagement")
      .describe("Primary metric to analyze"),
    timeRange: z
      .enum(["7d", "30d", "90d", "ytd"])
      .optional()
      .default("30d")
      .describe("Time range for analysis"),
    compareBaseline: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to compare against baseline cohort"),
  })
  .passthrough(); // ignore unknown keys from the cognition agent

const CohortMonitorOutput = z.object({
  cohortId: z.string(),
  metric: z.string(),
  currentValue: z.number(),
  baselineValue: z.number().optional(),
  percentChange: z.number().optional(),
  trend: z.enum(["improving", "stable", "declining"]),
  insight: z.string(),
  recommendation: z.string(),
  alertLevel: z.enum(["none", "info", "warning", "critical"]),
  dataSource: z.string().optional(),
});

type PromptLoader = typeof loadAgentPromptSpec;

export const COHORT_MONITOR_SYSTEM_PROMPT_FILE =
  "knowledge/sub-agents/cohort-monitor/system-prompt.md";

export const COHORT_MONITOR_SYSTEM_PROMPT_FALLBACK = `You are the Cohort Monitor sub-agent for {{BRAND_NAME}}.

Your role is to analyze audience cohort data and surface actionable marketing insights.

## What you do
- Analyze engagement, retention, conversion, churn, and LTV metrics
- Compare cohort performance against baselines
- Detect trends (improving / stable / declining)
- Generate concise, actionable recommendations
- Flag alerts when metrics cross critical thresholds

## Output format
Respond with a JSON object matching this structure:
{
  "cohortId": string,
  "metric": string,
  "currentValue": number,
  "baselineValue": number | null,
  "percentChange": number | null,
  "trend": "improving" | "stable" | "declining",
  "insight": "One-sentence insight about the cohort",
  "recommendation": "One actionable recommendation",
  "alertLevel": "none" | "info" | "warning" | "critical"
}

## Brand voice
Tone: {{BRAND_TONE}}
Style: {{BRAND_STYLE}}

## Rules
- Always ground analysis in data
- Flag declining metrics proactively
- Recommendations should be specific and actionable
- {{SKILL_CREATION_INSTRUCTION}}`;

// ── Plugin ─────────────────────────────────────────────────────

export class CohortMonitorAgent extends BaseSubAgent {
  id = "cohort-monitor";
  name = "Cohort Monitor";
  description =
    "Analyzes audience cohort metrics — engagement, retention, conversion, churn, and LTV. " +
    "Detects trends, compares against baselines, and surfaces actionable insights.";
  version = "1.1.0";
  capabilities = [
    "cohort-analysis",
    "engagement-tracking",
    "retention-analysis",
    "churn-detection",
    "ltv-estimation",
  ];

  inputSchema = CohortMonitorInput;
  outputSchema = CohortMonitorOutput;
  private promptLoader: PromptLoader;
  private promptFile: string;
  private resolvedPromptSource: string | null;

  constructor(options?: { promptLoader?: PromptLoader; promptFile?: string }) {
    super(
      "openai:fast", // preferred (used only in AI mode)
      ["anthropic:fast", "google:fast"],
      5,
      0.1
    );
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? COHORT_MONITOR_SYSTEM_PROMPT_FILE;
    this.resolvedPromptSource = this.promptFile;
  }

  // ── Mock-based execution (no AI model calls) ──────────────

  /**
   * Override BaseSubAgent.execute() to return mock data directly.
   *
   * This makes the cohort-monitor deterministic, fast, and independent
   * of AI model availability. When real data sources are connected,
   * replace this with `super.execute(input, context)` to use the
   * AI-based flow with tools.
   */
  async execute(input: unknown, context: ExecutionContext): Promise<AgentResult> {
    const pipelineRunId = context.requestContext.pipelineRunId ?? context.sessionId;
    const runId = context.requestContext.runId ?? context.sessionId;
    const auditBase = {
      pipelineRunId,
      runId,
      sessionId: context.sessionId,
      phase: "sub-agent",
      componentKind: "sub-agent" as const,
      componentId: this.id,
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
      brandId: context.requestContext.brandId,
    };
    await agentAuditStore.record({
      ...auditBase,
      eventType: "invoke",
      status: "running",
      payload: { input },
    });

    const parsed = CohortMonitorInput.safeParse(input);

    if (!parsed.success) {
      // Even with lenient schema this shouldn't happen, but handle gracefully
      logger.warn(`cohort-monitor: input parse failed, using defaults`, {
        errors: parsed.error.flatten(),
      });
      const fallback = getMockCohortData({});
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "warning",
        payload: {
          decision: "input-parse-failed-using-defaults",
          details: parsed.error.flatten(),
        },
      });
      await agentAuditStore.record({
        ...auditBase,
        eventType: "result",
        status: "completed",
        payload: fallback as unknown as Record<string, unknown>,
      });
      return {
        success: true,
        output: JSON.stringify(fallback),
        modelUsed: "mock-data-service",
      };
    }

    const { cohortId, metric, timeRange, compareBaseline } = parsed.data;

    logger.info(`cohort-monitor: executing mock query`, {
      cohortId,
      metric,
      timeRange,
      compareBaseline,
    });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "decision",
      status: "completed",
      payload: {
        decision: "mock-cohort-query",
        cohortId,
        metric,
        timeRange,
        compareBaseline,
      },
    });

    // If no specific metric was requested, return an overview of all metrics
    if (!input || (typeof input === "object" && !(input as Record<string, unknown>).metric)) {
      const overview = getMockCohortOverview(cohortId);
      await agentAuditStore.record({
        ...auditBase,
        eventType: "result",
        status: "completed",
        payload: { overview } as Record<string, unknown>,
      });
      return {
        success: true,
        output: JSON.stringify(overview),
        modelUsed: "mock-data-service",
      };
    }

    // Single-metric query
    const result = getMockCohortData({ cohortId, metric, timeRange, compareBaseline });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "result",
      status: "completed",
      payload: result as unknown as Record<string, unknown>,
    });

    return {
      success: true,
      output: JSON.stringify(result),
      modelUsed: "mock-data-service",
    };
  }

  // ── AI-based methods (kept for future real-data mode) ──────

  getSystemPrompt(context: ExecutionContext): string {
    const vars = {
      BRAND_NAME: context.brandIdentity.name,
      BRAND_TONE: context.brandIdentity.voice.tone,
      BRAND_STYLE: context.brandIdentity.voice.style,
      SKILL_CREATION_INSTRUCTION: this.getSkillCreationInstruction(),
    };

    if (this.promptLoader === loadAgentPromptSpec) {
      const spec = resolveAgentPromptSpec(
        this.id,
        this.promptFile,
        COHORT_MONITOR_SYSTEM_PROMPT_FALLBACK,
        vars,
        { brandId: context.requestContext.brandId }
      );
      this.resolvedPromptSource = spec.source ?? this.promptFile;
      return spec.content;
    }

    this.resolvedPromptSource = this.promptFile;
    return this.promptLoader(
      this.id,
      this.promptFile,
      COHORT_MONITOR_SYSTEM_PROMPT_FALLBACK,
      vars,
      { brandId: context.requestContext.brandId }
    );
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Tools are available for the AI-based execution path (future use).
    // In mock mode, execute() returns data directly without calling tools.
    return {};
  }

  protected override getPromptSourceIdentifier(): string | null {
    return this.resolvedPromptSource;
  }
}

// Auto-register on import
import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new CohortMonitorAgent());
