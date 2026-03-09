import type {
  AgencyResult,
  CognitionResult,
  GuardrailConstraints,
} from "../core/types.js";

const MAX_CRITICAL_FACTS = 8;

function cleanLine(line: string): string {
  return line
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function splitCandidateLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function looksLikeCriticalFact(line: string): boolean {
  const lower = line.toLowerCase();
  if (/\d/.test(line)) return true;
  if (/\b(utc|today|yesterday|this week|last \d+ days?|from|to)\b/i.test(line))
    return true;
  if (
    /\b(total|top|highest|lowest|sessions|impressions|revenue|conversion|retention|churn|clv|metric)\b/i.test(
      lower
    )
  )
    return true;
  return false;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extractCriticalFacts(agencyResult: AgencyResult): string[] {
  const candidates: string[] = [];

  candidates.push(
    ...splitCandidateLines(String(agencyResult.summary ?? "")).filter(
      looksLikeCriticalFact
    )
  );

  for (const entry of agencyResult.results) {
    if (entry.result.success !== true) continue;
    if (typeof entry.result.output !== "string") continue;
    const lines = splitCandidateLines(entry.result.output).filter(
      looksLikeCriticalFact
    );
    candidates.push(...lines);
  }

  const issues = Array.isArray(agencyResult.issues)
    ? agencyResult.issues
        .filter((issue): issue is string => typeof issue === "string")
        .map((issue) => `Issue: ${cleanLine(issue)}`)
    : [];

  return dedupe([...candidates, ...issues]).slice(0, MAX_CRITICAL_FACTS);
}

export function buildHumanReadableRenderRequirements(
  guardrails: GuardrailConstraints,
  cognitionResult?: CognitionResult
): string[] {
  const requirements = [
    "Use markdown headings and short bullet lists for readability.",
    "Always include a 'Key Findings' section with concrete numbers.",
    "Always include a 'Data Source and Time Window' section.",
    "Always include a 'Recommended Next Step' section.",
  ];

  const alwaysDoRules = guardrails.alwaysDo.slice(0, 3).map((rule) => `Guardrail: ${rule}`);
  requirements.push(...alwaysDoRules);

  if (cognitionResult?.plan) {
    requirements.push(`Execution Plan Context: ${cognitionResult.plan}`);
  }

  return requirements;
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function enforceCriticalFactsInResponse(
  formattedResponse: string,
  criticalFacts: string[]
): string {
  if (criticalFacts.length === 0) return formattedResponse;

  const normalizedResponse = normalizeForCompare(formattedResponse);
  const missing = criticalFacts.filter((fact) => {
    const normalizedFact = normalizeForCompare(fact);
    return normalizedFact.length > 0 && !normalizedResponse.includes(normalizedFact);
  });

  if (missing.length === 0) return formattedResponse;

  const appendix = [
    "## Detailed Findings",
    ...missing.map((fact) => `- ${fact}`),
  ].join("\n");

  return `${formattedResponse.trim()}\n\n${appendix}`;
}
