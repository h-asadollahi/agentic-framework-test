import { normalizeBrandId } from "../core/request-context.js";
import type { CognitionResult, RequestAudience, RequestContext } from "../core/types.js";

export interface TokenUsageMonitorRequest extends Record<string, unknown> {
  audience: RequestAudience;
  brandId: string | null;
  days: number;
  bucket: "day";
}

function parseAudienceFilter(
  normalized: string,
  overrides?: Record<string, unknown>
): RequestAudience {
  const overrideAudience =
    typeof overrides?.audience === "string" ? overrides.audience.trim().toLowerCase() : "";
  if (overrideAudience === "admin" || overrideAudience === "marketer") {
    return overrideAudience;
  }

  if (/\badmins?\b/.test(normalized) && !/\bmarketers?\b/.test(normalized)) {
    return "admin";
  }

  return "marketer";
}

function parseDays(
  normalized: string,
  overrides?: Record<string, unknown>
): number {
  if (typeof overrides?.days === "number" && Number.isInteger(overrides.days)) {
    return Math.min(365, Math.max(1, overrides.days));
  }

  const explicitDayCount = normalized.match(/\blast\s+(\d{1,3})\s+days?\b/);
  if (explicitDayCount) {
    const days = Number.parseInt(explicitDayCount[1] ?? "7", 10);
    return Math.min(365, Math.max(1, days));
  }

  if (/\btoday\b/.test(normalized)) return 1;
  if (/\byesterday\b/.test(normalized)) return 2;
  return 7;
}

function parseBrandScope(
  normalized: string,
  requestContext: RequestContext,
  overrides?: Record<string, unknown>
): string | null {
  const overrideBrandId =
    typeof overrides?.brandId === "string" ? normalizeBrandId(overrides.brandId) : null;
  if (overrideBrandId) return overrideBrandId;
  if (/\ball brands?\b/.test(normalized) || /\bacross all brands?\b/.test(normalized)) {
    return null;
  }
  return normalizeBrandId(requestContext.brandId);
}

export function inferAdminTokenUsageMonitorRequest(
  userMessage: string,
  requestContext: RequestContext,
  overrides?: Record<string, unknown>
): TokenUsageMonitorRequest | null {
  if (requestContext.audience !== "admin") return null;

  const normalized = userMessage.toLowerCase();
  const mentionsToken = /\btokens?\b/.test(normalized);
  const mentionsUsageSignal =
    /\busage\b/.test(normalized) ||
    /\bused\b/.test(normalized) ||
    /\bspend\b/.test(normalized) ||
    /\bspent\b/.test(normalized) ||
    /\bconsum(?:e|ed|ption)\b/.test(normalized) ||
    /\bdaily\b/.test(normalized);
  const mentionsModelScope =
    /\bllms?\b/.test(normalized) ||
    /\bmodels?\b/.test(normalized) ||
    /\bproviders?\b/.test(normalized) ||
    /\bopenai\b/.test(normalized) ||
    /\bclaude\b/.test(normalized) ||
    /\banthropic\b/.test(normalized) ||
    /\bgemini\b/.test(normalized) ||
    /\bgoogle\b/.test(normalized);

  if (!(mentionsToken && mentionsUsageSignal && mentionsModelScope)) {
    return null;
  }

  return {
    audience: parseAudienceFilter(normalized, overrides),
    brandId: parseBrandScope(normalized, requestContext, overrides),
    days: parseDays(normalized, overrides),
    bucket: "day",
  };
}

export function buildDeterministicAdminObservabilityPlan(
  userMessage: string,
  requestContext: RequestContext
): CognitionResult | null {
  const request = inferAdminTokenUsageMonitorRequest(userMessage, requestContext);
  if (!request) return null;

  return {
    subtasks: [
      {
        id: "task-1",
        agentId: "token-usage-monitor",
        description: "Aggregate daily LLM token usage for operational reporting",
        input: request,
        dependencies: [],
        priority: "high",
      },
    ],
    reasoning:
      "Deterministic admin observability fast path: token-usage prompts map directly to the token-usage-monitor capability.",
    plan: "Use the token-usage-monitor sub-agent to aggregate forward-only telemetry for the requested audience and brand scope.",
    rejected: false,
  };
}
