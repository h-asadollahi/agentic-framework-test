/**
 * Mock Data Service for the Cohort Monitor sub-agent.
 *
 * Provides deterministic happy-path and sad-path scenarios so the
 * cohort-monitor can return realistic data without external dependencies.
 *
 * Scenario selection:
 *   - cohortId contains "vip" or "premium"  → happy path
 *   - cohortId contains "at-risk" or "churning" → sad path
 *   - otherwise → random (60 % happy / 40 % sad)
 */

// ── Types ──────────────────────────────────────────────────────

export type Metric = "engagement" | "retention" | "conversion" | "churn" | "ltv";
export type Trend = "improving" | "stable" | "declining";
export type AlertLevel = "none" | "info" | "warning" | "critical";

export interface CohortMockResult {
  cohortId: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  percentChange: number;
  trend: Trend;
  insight: string;
  recommendation: string;
  alertLevel: AlertLevel;
  dataSource: "mock";
}

// ── Scenario Definitions ───────────────────────────────────────

interface Scenario {
  currentValue: number;
  baselineValue: number;
  percentChange: number;
  trend: Trend;
  insight: string;
  recommendation: string;
  alertLevel: AlertLevel;
}

const HAPPY: Record<Metric, Scenario> = {
  engagement: {
    currentValue: 0.47,
    baselineValue: 0.42,
    percentChange: 12,
    trend: "improving",
    insight: "Engagement rate rose 12 % quarter-over-quarter, driven by personalised push campaigns.",
    recommendation: "Double down on the personalised push strategy — test richer media formats next.",
    alertLevel: "none",
  },
  retention: {
    currentValue: 0.68,
    baselineValue: 0.66,
    percentChange: 3,
    trend: "stable",
    insight: "Retention holds steady at 68 %, slightly above the 66 % baseline.",
    recommendation: "Retention is healthy — shift focus to conversion optimisation.",
    alertLevel: "none",
  },
  conversion: {
    currentValue: 0.041,
    baselineValue: 0.034,
    percentChange: 18,
    trend: "improving",
    insight: "Conversion jumped 18 % after the checkout-flow redesign launched.",
    recommendation: "Roll the new checkout flow to 100 % of traffic and monitor drop-off.",
    alertLevel: "info",
  },
  churn: {
    currentValue: 0.09,
    baselineValue: 0.12,
    percentChange: -25,
    trend: "improving",
    insight: "Churn dropped 25 % following the new loyalty-reward programme.",
    recommendation: "Expand the loyalty programme to mid-tier customers for broader impact.",
    alertLevel: "none",
  },
  ltv: {
    currentValue: 139.0,
    baselineValue: 127.5,
    percentChange: 9,
    trend: "improving",
    insight: "Average LTV climbed 9 % as upsell campaigns drove higher basket value.",
    recommendation: "Test bundled product recommendations to push LTV further.",
    alertLevel: "none",
  },
};

const SAD: Record<Metric, Scenario> = {
  engagement: {
    currentValue: 0.39,
    baselineValue: 0.42,
    percentChange: -8,
    trend: "declining",
    insight: "Engagement fell 8 % — email open rates and click-through rates both declined.",
    recommendation: "Audit email deliverability and A/B-test new subject-line strategies.",
    alertLevel: "warning",
  },
  retention: {
    currentValue: 0.53,
    baselineValue: 0.62,
    percentChange: -15,
    trend: "declining",
    insight: "Retention dropped 15 % — the largest single-quarter decline in 12 months.",
    recommendation: "Launch a win-back campaign targeting users inactive for 30+ days.",
    alertLevel: "critical",
  },
  conversion: {
    currentValue: 0.022,
    baselineValue: 0.028,
    percentChange: -22,
    trend: "declining",
    insight: "Conversion fell 22 % — cart abandonment spiked after the pricing update.",
    recommendation: "Revert the pricing change for a 2-week holdout test to confirm causality.",
    alertLevel: "critical",
  },
  churn: {
    currentValue: 0.195,
    baselineValue: 0.15,
    percentChange: 30,
    trend: "declining",
    insight: "Churn spiked 30 % — correlated with a competitor's aggressive promotion.",
    recommendation: "Deploy a retention offer to at-risk segments within 48 hours.",
    alertLevel: "critical",
  },
  ltv: {
    currentValue: 93.5,
    baselineValue: 105.0,
    percentChange: -11,
    trend: "declining",
    insight: "LTV shrank 11 % as discount-driven purchases replaced full-price orders.",
    recommendation: "Reduce blanket discounting; shift to personalised value-add offers.",
    alertLevel: "warning",
  },
};

// ── Public API ─────────────────────────────────────────────────

/**
 * Decide whether a cohort should receive happy-path or sad-path data.
 */
function pickPath(cohortId: string): "happy" | "sad" {
  const id = cohortId.toLowerCase();

  if (id.includes("vip") || id.includes("premium") || id.includes("loyal")) {
    return "happy";
  }
  if (id.includes("at-risk") || id.includes("churning") || id.includes("inactive")) {
    return "sad";
  }

  // Default: 60 % happy, 40 % sad
  return Math.random() < 0.6 ? "happy" : "sad";
}

/**
 * Return mock cohort data for the given parameters.
 */
export function getMockCohortData(params: {
  cohortId?: string;
  metric?: string;
  timeRange?: string;
  compareBaseline?: boolean;
}): CohortMockResult {
  const cohortId = params.cohortId || "default-cohort";
  const metric = (params.metric || "engagement") as Metric;
  const path = pickPath(cohortId);

  const scenario = path === "happy" ? HAPPY[metric] : SAD[metric];

  // Fallback if metric isn't in the scenario tables
  const fallback: Scenario = {
    currentValue: 0.5,
    baselineValue: 0.5,
    percentChange: 0,
    trend: "stable",
    insight: `No data available for metric "${metric}".`,
    recommendation: "Verify the metric name and try again.",
    alertLevel: "info",
  };

  const s = scenario ?? fallback;

  return {
    cohortId,
    metric,
    currentValue: s.currentValue,
    baselineValue: s.baselineValue,
    percentChange: s.percentChange,
    trend: s.trend,
    insight: s.insight,
    recommendation: s.recommendation,
    alertLevel: s.alertLevel,
    dataSource: "mock",
  };
}

/**
 * Return mock data for ALL metrics at once (useful for overview requests).
 */
export function getMockCohortOverview(cohortId?: string): CohortMockResult[] {
  const metrics: Metric[] = ["engagement", "retention", "conversion", "churn", "ltv"];
  return metrics.map((metric) =>
    getMockCohortData({ cohortId, metric })
  );
}
