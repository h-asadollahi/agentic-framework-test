import type { CognitionResult, RequestContext } from "../core/types.js";

const COMPETITOR_PATTERNS = [
  /\bcompetitor\b/i,
  /\bcompetitors\b/i,
  /\brival\b/i,
  /\brivals\b/i,
  /\bagainst\b.*\b(us|our brand)\b/i,
  /\bcompare\s+us\s+to\b/i,
];

const NON_MARKETING_PATTERNS = [
  /\bweather\b/i,
  /\brecipe\b/i,
  /\bcook\b/i,
  /\bmovie\b/i,
  /\bfootball\b/i,
  /\bnba\b/i,
  /\bpolitics\b/i,
  /\bcrypto trading\b/i,
];

const ADMIN_OPERATIONS_HINTS = [
  /\btoken\b/i,
  /\busage\b/i,
  /\bllm\b/i,
  /\bopenai\b/i,
  /\bclaude\b/i,
  /\bgemini\b/i,
  /\bmodel\b/i,
  /\btelemetry\b/i,
  /\brun\b/i,
  /\broute\b/i,
  /\bskill\b/i,
  /\bagent\b/i,
  /\bsub-agent\b/i,
  /\bslack\b/i,
  /\btrigger\b/i,
  /\borchestrator\b/i,
  /\bperformance\b/i,
  /\bmonitor(ing)?\b/i,
  /\bbrand\b/i,
];

export function detectCognitionGuardrailRejection(userMessage: string): {
  rejected: boolean;
  reason?: string;
};
export function detectCognitionGuardrailRejection(
  userMessage: string,
  requestContext?: RequestContext
): {
  rejected: boolean;
  reason?: string;
};
export function detectCognitionGuardrailRejection(
  userMessage: string,
  requestContext?: RequestContext
): {
  rejected: boolean;
  reason?: string;
} {
  if (requestContext?.audience === "admin") {
    const looksOperational = ADMIN_OPERATIONS_HINTS.some((pattern) =>
      pattern.test(userMessage)
    );
    if (!looksOperational && NON_MARKETING_PATTERNS.some((pattern) => pattern.test(userMessage))) {
      return {
        rejected: true,
        reason:
          "This admin chat handles operational questions about the framework, brands, routes, telemetry, runs, and agents.",
      };
    }

    return { rejected: false };
  }

  if (COMPETITOR_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      rejected: true,
      reason:
        "I can’t help with competitor-focused requests. Please ask about your own brand’s marketing performance, campaigns, audiences, or analytics.",
    };
  }

  if (NON_MARKETING_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      rejected: true,
      reason:
        "This request is outside the marketing assistant scope. Ask a marketing-related question about campaigns, channels, segments, content, or performance.",
    };
  }

  return { rejected: false };
}

export function buildRejectedCognitionResult(reason: string): CognitionResult {
  return {
    subtasks: [],
    reasoning: `Rejected by cognition guardrail: ${reason}`,
    plan: "Request rejected at cognition stage.",
    rejected: true,
    rejectionReason: reason,
  };
}
