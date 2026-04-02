import { task, logger } from "@trigger.dev/sdk/v3";
import { cognitionAgent } from "../agents/cognition-agent.js";
import type {
  CognitionResult,
  GroundingResult,
  JudgementPacket,
  RequestContext,
  SubTask,
} from "../core/types.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { withRunId } from "../core/request-context.js";
import {
  buildRejectedCognitionResult,
  detectCognitionGuardrailRejection,
} from "./cognition-guardrails.js";
import { buildDeterministicAdminObservabilityPlan } from "./admin-observability.js";
import { parseAgentJson } from "./agent-output-parser.js";
import { isSynthesisLikeDescription } from "./execute-routing.js";
import { agentAuditStore } from "../observability/agent-audit-store.js";
import {
  buildJudgementPacket,
  shouldSkipCognitionForStrongDeterministicRoute,
} from "./judgement-packet.js";
import {
  buildPlanCacheKey,
  getCachedPlan,
  setCachedPlan,
} from "../optimization/runtime-caches.js";

/**
 * Think Task (Cognition)
 *
 * Second stage of the guardrail pipeline.
 * Decomposes the user's request into an executable subtask plan.
 */
export const thinkTask = task({
  id: "pipeline-think",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    userMessage: string;
    groundingResult: GroundingResult;
  }, taskContext) => {
    logger.info("Starting cognition phase");

    // pipeline-think runs in its own task process; always preload DB-backed
    // route/skill stores before cognition prompt construction.
    await preloadCognitionStores();

    const context = {
      ...payload.groundingResult.context,
      requestContext: withRunId(
        payload.groundingResult.context.requestContext,
        taskContext.ctx.run.id
      ),
    };
    const auditBase = {
      pipelineRunId: context.requestContext.pipelineRunId ?? context.sessionId,
      runId: taskContext.ctx.run.id,
      sessionId: context.sessionId,
      phase: "cognition",
      componentKind: "task" as const,
      componentId: "pipeline-think",
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
      brandId: context.requestContext.brandId,
    };

    await agentAuditStore.record({
      ...auditBase,
      eventType: "invoke",
      status: "running",
      payload: {
        userMessage: payload.userMessage,
      },
    });

    const deterministicAdminPlan = buildDeterministicAdminObservabilityPlan(
      payload.userMessage,
      context.requestContext
    );
    if (deterministicAdminPlan) {
      logger.info("Cognition admin observability fast path activated", {
        sessionId: context.sessionId,
        subtaskCount: deterministicAdminPlan.subtasks.length,
      });
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "completed",
        payload: {
          decision: "deterministic-admin-observability-fast-path",
          subtaskCount: deterministicAdminPlan.subtasks.length,
        },
      });
      return deterministicAdminPlan;
    }

    const guardrailDecision = detectCognitionGuardrailRejection(
      payload.userMessage,
      context.requestContext
    );
    if (guardrailDecision.rejected) {
      const rejected = buildRejectedCognitionResult(
        guardrailDecision.reason ??
          "Request is out of scope for this marketing assistant."
      );
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "completed",
        payload: {
          decision: "guardrail-rejection",
          reason: guardrailDecision.reason,
        },
      });
      return rejected;
    }

    const judgementPacket = buildJudgementPacket(payload.userMessage, context);
    context.shortTermMemory.activeContext.judgementPacket = judgementPacket;
    await agentAuditStore.record({
      ...auditBase,
      eventType: "decision",
      status: "completed",
      payload: {
        decision: "judgement-packet-built",
        classification: judgementPacket.classification,
        routeCandidateCount: judgementPacket.routeCandidates.length,
        skillCandidateCount: judgementPacket.skillCandidates.length,
        routeInventoryHash: judgementPacket.routeInventoryHash,
        skillInventoryHash: judgementPacket.skillInventoryHash,
      },
    });

    const planCacheKey = buildPlanCacheKey({
      userMessage: payload.userMessage.trim().toLowerCase(),
      brandContractHash: context.brandContract.hash,
      routeInventoryHash: judgementPacket.routeInventoryHash,
      skillInventoryHash: judgementPacket.skillInventoryHash,
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
    });
    const cachedPlan =
      judgementPacket.autonomyPolicy.allowPlanCache &&
      getCachedPlan(planCacheKey);
    if (cachedPlan) {
      logger.info("Cognition plan cache hit", {
        sessionId: context.sessionId,
        subtaskCount: cachedPlan.subtasks.length,
      });
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "completed",
        payload: {
          decision: "plan-cache-hit",
          planCacheKey,
          subtaskCount: cachedPlan.subtasks.length,
        },
      });
      return cachedPlan;
    }

    if (shouldSkipCognitionForStrongDeterministicRoute(judgementPacket)) {
      const deterministicPlan = buildDeterministicRoutePlan(
        payload.userMessage,
        judgementPacket
      );
      setCachedPlan(planCacheKey, deterministicPlan);
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "completed",
        payload: {
          decision: "strong-deterministic-route-skip",
          routeId: judgementPacket.routeCandidates[0]?.id,
          routeScore: judgementPacket.routeCandidates[0]?.score ?? 0,
        },
      });
      return deterministicPlan;
    }

    const input = JSON.stringify({
      userMessage: payload.userMessage,
      requestContext: context.requestContext,
      judgementPacket,
      brandContract: {
        hash: context.brandContract.hash,
        version: context.brandContract.version,
        summary: judgementPacket.brandContractSummary,
        judgementNotes: context.brandContract.judgementNotes,
      },
      requestContextSummary: {
        audience: context.requestContext.audience,
        scope: context.requestContext.scope,
        brandId: context.requestContext.brandId,
      },
    });

    const result = await cognitionAgent.execute(input, context);

    logger.info("Cognition phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    // Parse the plan
    let cognitionResult: CognitionResult;
    const parsedOutput = parseAgentJson<CognitionResult>(result.output);
    if (parsedOutput) {
      cognitionResult = parsedOutput;
    } else {
      logger.warn("Cognition agent output wasn't valid JSON, creating default plan");
      cognitionResult = {
        subtasks: [
          {
            id: "task-1",
            agentId: "general",
            description: payload.userMessage,
            input: {},
            dependencies: [],
            priority: "medium",
          },
        ],
        reasoning: "Could not parse agent output, falling back to single general task",
        plan: payload.userMessage,
        rejected: false,
      };
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "warning",
        payload: {
          decision: "cognition-output-fallback",
          reason: "Could not parse cognition agent output; falling back to single general task.",
        },
      });
    }

    if (cognitionResult.rejected === true) {
      const reason =
        cognitionResult.rejectionReason ??
        "Request rejected by cognition guardrails.";
      cognitionResult = buildRejectedCognitionResult(reason);
    }

    if (cognitionResult.rejected !== true) {
      const originalSubtaskCount = cognitionResult.subtasks.length;
      cognitionResult = applyAutonomousSkillCreation(
        cognitionResult,
        payload.userMessage,
        context.requestContext
      );
      cognitionResult = constrainDeterministicSingleRouteSynthesis(
        cognitionResult
      );
      if (cognitionResult.subtasks.length !== originalSubtaskCount) {
        await agentAuditStore.record({
          ...auditBase,
          eventType: "decision",
          status: "completed",
          payload: {
            decision: "cognition-plan-adjusted",
            originalSubtaskCount,
            finalSubtaskCount: cognitionResult.subtasks.length,
          },
        });
      }
    }

    if (cognitionResult.rejected !== true) {
      cognitionResult = enforceJudgementPacketGuardrails(
        cognitionResult,
        judgementPacket
      );
      setCachedPlan(planCacheKey, cognitionResult);
    }

    logger.info(`Cognition produced ${cognitionResult.subtasks.length} subtasks`);
    await agentAuditStore.record({
      ...auditBase,
      eventType: "result",
      status: cognitionResult.rejected === true ? "rejected" : "completed",
      payload: {
        subtaskCount: cognitionResult.subtasks.length,
        reasoning: cognitionResult.reasoning,
        plan: cognitionResult.plan,
        rejected: cognitionResult.rejected === true,
        rejectionReason: cognitionResult.rejectionReason ?? null,
        subtasks: cognitionResult.subtasks,
      },
    });
    return cognitionResult;
  },
});

export async function preloadCognitionStores(): Promise<void> {
  await learnedRoutesStore.load();
  await skillCandidatesStore.load();
}

function buildDeterministicRoutePlan(
  userMessage: string,
  judgementPacket: JudgementPacket
): CognitionResult {
  const bestRoute = judgementPacket.routeCandidates[0];
  const agentId =
    bestRoute.routeType === "api"
      ? "api-fetcher"
      : bestRoute.agentId ?? "general";

  return {
    subtasks: [
      {
        id: "task-1",
        agentId,
        description: userMessage,
        input: {
          routeId: bestRoute.id,
        },
        dependencies: [],
        priority: "high",
      },
    ],
    reasoning: `Strong deterministic route match "${bestRoute.id}" (${bestRoute.capability}) with score ${bestRoute.score}; skipping cognition model planning.`,
    plan: `Execute learned route ${bestRoute.id} via ${agentId}.`,
    rejected: false,
  };
}

function planViolatesGuardrails(
  cognitionResult: CognitionResult,
  judgementPacket: JudgementPacket
): boolean {
  const combinedText = [
    cognitionResult.reasoning,
    cognitionResult.plan,
    ...cognitionResult.subtasks.map((subtask) => subtask.description),
  ]
    .join(" ")
    .toLowerCase();

  return judgementPacket.neverDo.some((rule) => {
    const tokens = rule
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 4);
    return tokens.length > 0 && tokens.every((token) => combinedText.includes(token));
  });
}

function enforceJudgementPacketGuardrails(
  cognitionResult: CognitionResult,
  judgementPacket: JudgementPacket
): CognitionResult {
  if (planViolatesGuardrails(cognitionResult, judgementPacket)) {
    return buildRejectedCognitionResult(
      "The request conflicts with the active brand guardrails and requires human review or a reformulated request."
    );
  }

  return {
    ...cognitionResult,
    reasoning: `${cognitionResult.reasoning} | Judgement packet enforced alwaysDo: ${judgementPacket.alwaysDo
      .slice(0, 3)
      .join("; ")}.`,
  };
}

export function applyAutonomousSkillCreation(
  cognitionResult: CognitionResult,
  userMessage: string,
  requestContext?: RequestContext
): CognitionResult {
  const matchedCandidate = skillCandidatesStore.findBestMatchByPrompt(
    userMessage,
    requestContext
  );
  if (!matchedCandidate) return cognitionResult;

  void skillCandidatesStore.incrementUsage(matchedCandidate.id);

  const alreadyHasSkillCreatorTask = cognitionResult.subtasks.some((subtask) => {
    if (!isSkillCreatorAgent(subtask.agentId)) return false;
    const candidateId =
      typeof subtask.input?.candidateId === "string"
        ? subtask.input.candidateId
        : null;
    if (candidateId && candidateId === matchedCandidate.id) return true;

    const skillFile =
      typeof subtask.input?.suggestedSkillFile === "string"
        ? subtask.input.suggestedSkillFile
        : null;
    return Boolean(skillFile && skillFile === matchedCandidate.suggestedSkillFile);
  });

  if (alreadyHasSkillCreatorTask) return cognitionResult;

  const isMaterialized = skillCandidatesStore.isMaterialized(
    matchedCandidate.suggestedSkillFile
  );
  if (isMaterialized) {
    const reused = applyMaterializedSkillReuse(
      cognitionResult,
      matchedCandidate,
      userMessage
    );

    logger.info("Cognition autonomous skill reuse activated", {
      candidateId: matchedCandidate.id,
      capability: matchedCandidate.capability,
      skillFile: matchedCandidate.suggestedSkillFile,
    });

    return reused;
  }

  const autoTaskId = nextAutonomousSkillTaskId(cognitionResult.subtasks);
  const autonomousSkillTask: SubTask = {
    id: autoTaskId,
    agentId: "skill-creator",
    description: `Create missing reusable skill "${matchedCandidate.capability}" for this prompt`,
    input: {
      candidateId: matchedCandidate.id,
      capability: matchedCandidate.capability,
      description: matchedCandidate.description,
      suggestedSkillFile: matchedCandidate.suggestedSkillFile,
      triggerPatterns: matchedCandidate.triggerPatterns,
      autoCreate: true,
      source: "autonomous",
      matchedPrompt: userMessage,
    },
    dependencies: [],
    priority: "high",
  };

  const updatedSubtasks = [
    autonomousSkillTask,
    ...cognitionResult.subtasks.map((subtask) => {
      if (isSkillCreatorAgent(subtask.agentId)) return subtask;
      if (subtask.id === autoTaskId) return subtask;
      if (subtask.dependencies.includes(autoTaskId)) return subtask;
      return {
        ...subtask,
        dependencies: [...subtask.dependencies, autoTaskId],
      };
    }),
  ];

  logger.info("Cognition autonomous self-learning activated", {
    candidateId: matchedCandidate.id,
    capability: matchedCandidate.capability,
    skillFile: matchedCandidate.suggestedSkillFile,
  });

  return {
    ...cognitionResult,
    subtasks: updatedSubtasks,
    reasoning: `${cognitionResult.reasoning} | Autonomous self-learning: missing skill "${matchedCandidate.capability}" will be created via skill-creator before execution.`,
  };
}

const DETERMINISTIC_ROUTE_AGENT_IDS = new Set([
  "mcp-fetcher",
  "api-fetcher",
  "cohort-monitor",
]);

const ALLOWED_NON_DETERMINISTIC_IDS = new Set([
  "skill-creator",
  "skill_creator",
  "universal-skill-creator",
  "general",
  "assistant",
]);

export function constrainDeterministicSingleRouteSynthesis(
  cognitionResult: CognitionResult
): CognitionResult {
  const deterministic = cognitionResult.subtasks.filter((subtask) =>
    DETERMINISTIC_ROUTE_AGENT_IDS.has(subtask.agentId)
  );
  if (deterministic.length !== 1) {
    return cognitionResult;
  }

  const deterministicTask = deterministic[0];
  const removableSynthesis = cognitionResult.subtasks.filter((subtask) => {
    const normalizedAgentId = subtask.agentId.trim().toLowerCase();
    if (normalizedAgentId !== "general" && normalizedAgentId !== "assistant") {
      return false;
    }
    if (!looksLikeSynthesisSubtask(subtask.description)) {
      return false;
    }
    return subtask.dependencies.includes(deterministicTask.id);
  });

  if (removableSynthesis.length === 0) {
    return cognitionResult;
  }

  const hasUnsupportedSubtasks = cognitionResult.subtasks.some((subtask) => {
    if (DETERMINISTIC_ROUTE_AGENT_IDS.has(subtask.agentId)) return false;
    if (ALLOWED_NON_DETERMINISTIC_IDS.has(subtask.agentId)) return false;
    return true;
  });
  if (hasUnsupportedSubtasks) {
    return cognitionResult;
  }

  const removeIds = new Set(removableSynthesis.map((subtask) => subtask.id));
  const updatedSubtasks = cognitionResult.subtasks
    .filter((subtask) => !removeIds.has(subtask.id))
    .map((subtask) => ({
      ...subtask,
      dependencies: subtask.dependencies.filter((dep) => !removeIds.has(dep)),
    }));

  if (updatedSubtasks.length === cognitionResult.subtasks.length) {
    return cognitionResult;
  }

  logger.info("Cognition constrained redundant synthesis subtasks", {
    removed: removableSynthesis.length,
    deterministicTaskId: deterministicTask.id,
    deterministicAgentId: deterministicTask.agentId,
  });

  return {
    ...cognitionResult,
    subtasks: updatedSubtasks,
    reasoning: `${cognitionResult.reasoning} | Deterministic-route optimization: removed ${removableSynthesis.length} redundant synthesis subtask(s).`,
  };
}

function applyMaterializedSkillReuse(
  cognitionResult: CognitionResult,
  matchedCandidate: {
    id: string;
    capability: string;
    description: string;
    suggestedSkillFile: string;
    triggerPatterns: string[];
  },
  userMessage: string
): CognitionResult {
  let taggedCount = 0;
  const totalSubtasks = cognitionResult.subtasks.length;

  const updatedSubtasks = cognitionResult.subtasks.map((subtask) => {
    if (!shouldAttachMaterializedSkillHint(subtask, totalSubtasks)) {
      return subtask;
    }

    taggedCount += 1;
    return {
      ...subtask,
      input: {
        ...(subtask.input ?? {}),
        candidateId: matchedCandidate.id,
        capability: matchedCandidate.capability,
        suggestedSkillFile: matchedCandidate.suggestedSkillFile,
        triggerPatterns: matchedCandidate.triggerPatterns,
        useMaterializedSkill: true,
        source: "autonomous",
        matchedPrompt: userMessage,
      },
    };
  });

  if (taggedCount === 0) {
    return cognitionResult;
  }

  return {
    ...cognitionResult,
    subtasks: updatedSubtasks,
    reasoning: `${cognitionResult.reasoning} | Autonomous skill reuse: matched materialized skill "${matchedCandidate.capability}" (${matchedCandidate.suggestedSkillFile}) for synthesis/consolidation subtasks.`,
  };
}

function shouldAttachMaterializedSkillHint(
  subtask: SubTask,
  totalSubtasks: number
): boolean {
  const normalizedAgentId = subtask.agentId.trim().toLowerCase();
  if (normalizedAgentId !== "general" && normalizedAgentId !== "assistant") {
    return false;
  }

  if (looksLikeSynthesisSubtask(subtask.description)) {
    return true;
  }

  return totalSubtasks === 1;
}

function looksLikeSynthesisSubtask(description: string): boolean {
  return isSynthesisLikeDescription(description);
}

function isSkillCreatorAgent(agentId: string): boolean {
  const normalized = agentId.trim().toLowerCase();
  return (
    normalized === "skill-creator" ||
    normalized === "skill_creator" ||
    normalized === "universal-skill-creator"
  );
}

function nextAutonomousSkillTaskId(subtasks: SubTask[]): string {
  const base = "task-skill-autonomous";
  const ids = new Set(subtasks.map((task) => task.id));
  if (!ids.has(base)) return base;

  let index = 1;
  while (ids.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
