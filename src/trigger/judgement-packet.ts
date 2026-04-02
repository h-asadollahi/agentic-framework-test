import type {
  AutonomyPolicy,
  ExecutionContext,
  JudgementPacket,
  SubAgentSummary,
} from "../core/types.js";
import { buildBrandContractSummary } from "../core/brand-contract.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { subAgentRegistry } from "./sub-agents/registry.js";

function scoreSubAgentRelevance(
  userMessage: string,
  description: string,
  capabilities: string[]
): number {
  const lower = userMessage.toLowerCase();
  let score = 0;

  for (const capability of capabilities) {
    const normalized = capability.toLowerCase();
    if (lower.includes(normalized)) {
      score += normalized.length;
    }
  }

  for (const token of description.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length > 3 && lower.includes(token)) {
      score += 2;
    }
  }

  return score;
}

export function buildAutonomyPolicy(context: ExecutionContext): AutonomyPolicy {
  return {
    requireHumanControlForCriticalActions: true,
    allowDeterministicGrounding: true,
    allowPlanCache: true,
    allowDeterministicRouteSkip: context.requestContext.audience !== "admin",
    interactiveHitlReplyControlsOnly: true,
  };
}

function classifyRequest(
  userMessage: string,
  routeCount: number,
  skillCount: number
): JudgementPacket["classification"] {
  const lower = userMessage.toLowerCase();
  if (routeCount > 0) return "deterministic-route";
  if (skillCount > 0) return "deterministic-skill";
  if (/\btoken\b|\btelemetry\b|\badmin\b|\brun\b|\broute\b/.test(lower)) {
    return "operational";
  }
  if (/\bcampaign\b|\bconcept\b|\bcopy\b|\bcreative\b/.test(lower)) {
    return "creative";
  }
  if (/\banaly(s|z)e\b|\bmetric\b|\bkpi\b|\btrend\b/.test(lower)) {
    return "analytics";
  }
  return "general";
}

function buildRelevantSubAgentSummaries(userMessage: string): SubAgentSummary[] {
  return subAgentRegistry
    .getSummary()
    .map((agent) => ({
      id: agent.id,
      description: agent.description,
      capabilities: agent.capabilities,
      relevanceScore: scoreSubAgentRelevance(
        userMessage,
        agent.description,
        agent.capabilities
      ),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);
}

export function buildJudgementPacket(
  userMessage: string,
  context: ExecutionContext
): JudgementPacket {
  const routeCandidates = learnedRoutesStore.getTopMatches(
    userMessage,
    context.requestContext,
    3
  );
  const skillCandidates = skillCandidatesStore.getTopMatches(
    userMessage,
    context.requestContext,
    3
  );
  const autonomyPolicy = buildAutonomyPolicy(context);

  return {
    classification: classifyRequest(
      userMessage,
      routeCandidates.length,
      skillCandidates.length
    ),
    audience: context.requestContext.audience,
    scope: context.requestContext.scope,
    brandContractSummary: buildBrandContractSummary(context.brandContract),
    alwaysDo: context.brandContract.guardrails.alwaysDo.slice(0, 6),
    neverDo: context.brandContract.guardrails.neverDo.slice(0, 6),
    trustBoundary: [
      "Never remove brand or guardrail constraints from the plan.",
      "Escalate when a critical request requires explicit human review.",
      "Prefer deterministic routes and capabilities when they already exist.",
    ],
    hitlPolicy: [
      "Critical actions require human control.",
      "Monitoring notifications do not accept interactive replies.",
      "Only interactive HITL threads should advertise dismissal controls.",
    ],
    routeCandidates,
    skillCandidates,
    subAgentCandidates: buildRelevantSubAgentSummaries(userMessage),
    routeInventoryHash: learnedRoutesStore.getInventoryHash(
      context.requestContext
    ),
    skillInventoryHash: skillCandidatesStore.getInventoryHash(
      context.requestContext
    ),
    autonomyPolicy,
  };
}

export function shouldSkipCognitionForStrongDeterministicRoute(
  packet: JudgementPacket
): boolean {
  if (!packet.autonomyPolicy.allowDeterministicRouteSkip) return false;
  if (packet.routeCandidates.length === 0) return false;

  const [best, second] = packet.routeCandidates;
  if (best.routeType === "api" || best.agentId === "mcp-fetcher" || best.agentId === "token-usage-monitor") {
    if (best.matchedPatternCount >= 2) return true;
    if (best.score >= 30 && (!second || best.score >= second.score + 8)) return true;
  }

  return false;
}
