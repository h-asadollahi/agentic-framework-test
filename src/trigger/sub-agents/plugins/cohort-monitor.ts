import { z } from "zod";
import { type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext, AgentResult } from "../../../core/types.js";
import { getMockCohortData, getMockCohortOverview } from "./cohort-monitor-mock.js";
import { logger } from "../../../core/logger.js";
import { loadAgentPromptSpec } from "../../../tools/agent-spec-loader.js";

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

  constructor(options?: { promptLoader?: PromptLoader; promptFile?: string }) {
    super(
      "anthropic:fast",              // preferred (used only in AI mode)
      ["openai:fast", "google:fast"],
      5,
      0.1
    );
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? COHORT_MONITOR_SYSTEM_PROMPT_FILE;
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
    const parsed = CohortMonitorInput.safeParse(input);

    if (!parsed.success) {
      // Even with lenient schema this shouldn't happen, but handle gracefully
      logger.warn(`cohort-monitor: input parse failed, using defaults`, {
        errors: parsed.error.flatten(),
      });
      const fallback = getMockCohortData({});
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

    // If no specific metric was requested, return an overview of all metrics
    if (!input || (typeof input === "object" && !(input as Record<string, unknown>).metric)) {
      const overview = getMockCohortOverview(cohortId);
      return {
        success: true,
        output: JSON.stringify(overview),
        modelUsed: "mock-data-service",
      };
    }

    // Single-metric query
    const result = getMockCohortData({ cohortId, metric, timeRange, compareBaseline });

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

    return this.promptLoader(
      this.id,
      this.promptFile,
      COHORT_MONITOR_SYSTEM_PROMPT_FALLBACK,
      vars
    );
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Tools are available for the AI-based execution path (future use).
    // In mock mode, execute() returns data directly without calling tools.
    return {};
  }
}

// Auto-register on import
import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new CohortMonitorAgent());
