import type { CognitionResult } from "../core/types.js";

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

export function detectCognitionGuardrailRejection(userMessage: string): {
  rejected: boolean;
  reason?: string;
} {
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
