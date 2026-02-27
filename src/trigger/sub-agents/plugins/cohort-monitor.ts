import { z } from "zod";
import { tool, type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext } from "../../../core/types.js";

// ── Schemas ────────────────────────────────────────────────

const CohortMonitorInput = z.object({
  cohortId: z.string().optional().describe("Specific cohort ID to analyze"),
  metric: z
    .enum(["engagement", "retention", "conversion", "churn", "ltv"])
    .describe("Primary metric to analyze"),
  timeRange: z
    .enum(["7d", "30d", "90d", "ytd"])
    .default("30d")
    .describe("Time range for analysis"),
  compareBaseline: z
    .boolean()
    .default(true)
    .describe("Whether to compare against baseline cohort"),
});

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
});

// ── Plugin ─────────────────────────────────────────────────

export class CohortMonitorAgent extends BaseSubAgent {
  id = "cohort-monitor";
  name = "Cohort Monitor";
  description =
    "Analyzes audience cohort metrics — engagement, retention, conversion, churn, and LTV. " +
    "Detects trends, compares against baselines, and surfaces actionable insights.";
  version = "1.0.0";
  capabilities = [
    "cohort-analysis",
    "engagement-tracking",
    "retention-analysis",
    "churn-detection",
    "ltv-estimation",
  ];

  inputSchema = CohortMonitorInput;
  outputSchema = CohortMonitorOutput;

  constructor() {
    super(
      "anthropic:fast",                               // preferred — fast model for data analysis
      ["openai:fast", "google:fast"],                  // fallbacks
      5,                                               // maxSteps
      0.1                                              // low temperature for precise analysis
    );
  }

  getSystemPrompt(context: ExecutionContext): string {
    return `You are the Cohort Monitor sub-agent for ${context.brandIdentity.name}.

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
Tone: ${context.brandIdentity.voice.tone}
Style: ${context.brandIdentity.voice.style}

## Rules
- Always ground analysis in data (even simulated data for now)
- Flag declining metrics proactively
- Recommendations should be specific and actionable
- Never fabricate exact numbers — use realistic simulated data and label it as such`;
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return {
      getCohortMetrics: tool({
        description:
          "Retrieve engagement, retention, or conversion metrics for a cohort over a time range. " +
          "Returns simulated data in the current version.",
        inputSchema: z.object({
          cohortId: z.string().describe("Cohort identifier"),
          metric: z.string().describe("Metric name"),
          timeRange: z.string().describe("Time range"),
        }),
        execute: async ({ cohortId, metric, timeRange }) => {
          // Simulated data — will be replaced with real data source in production
          const baseValues: Record<string, number> = {
            engagement: 0.42,
            retention: 0.68,
            conversion: 0.034,
            churn: 0.12,
            ltv: 127.5,
          };
          const base = baseValues[metric] ?? 0.5;
          const jitter = (Math.random() - 0.5) * base * 0.2;

          return {
            cohortId: cohortId || "default-cohort",
            metric,
            timeRange,
            value: Number((base + jitter).toFixed(4)),
            sampleSize: Math.floor(Math.random() * 5000) + 1000,
            dataSource: "simulated",
          };
        },
      }),

      getBaselineMetrics: tool({
        description:
          "Retrieve baseline (overall average) metrics for comparison. " +
          "Returns simulated data in the current version.",
        inputSchema: z.object({
          metric: z.string().describe("Metric name"),
          timeRange: z.string().describe("Time range"),
        }),
        execute: async ({ metric, timeRange }) => {
          const baseValues: Record<string, number> = {
            engagement: 0.38,
            retention: 0.62,
            conversion: 0.028,
            churn: 0.15,
            ltv: 105.0,
          };

          return {
            metric,
            timeRange,
            value: baseValues[metric] ?? 0.4,
            sampleSize: 25000,
            dataSource: "simulated-baseline",
          };
        },
      }),
    };
  }
}

// Auto-register on import
import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new CohortMonitorAgent());
