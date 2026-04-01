import { task, logger } from "@trigger.dev/sdk/v3";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { agentAuditStore } from "../observability/agent-audit-store.js";
import {
  persistAndMaterializeSkillSuggestions,
  prepareAutonomousSkillSuggestionsForPersistence,
} from "./skill-learning.js";
import type {
  CognitionResult,
  ExecutionContext,
  SkillSuggestion,
} from "../core/types.js";

export const skillLearnerTask = task({
  id: "pipeline-skill-learner",
  retry: { maxAttempts: 1 },
  run: async (payload: {
    sessionId: string;
    cognitionResult: CognitionResult;
    context: ExecutionContext;
    skillSuggestions: SkillSuggestion[];
  }) => {
    // This task runs asynchronously and never blocks marketer-facing delivery.
    const requestContext = payload.context.requestContext;
    const pipelineRunId =
      requestContext?.pipelineRunId ?? requestContext?.runId ?? payload.sessionId;
    const audience = requestContext?.audience ?? "marketer";
    const scope = requestContext?.scope ?? "global";
    const brandId = requestContext?.brandId ?? null;

    await agentAuditStore.record({
      pipelineRunId,
      runId: requestContext?.runId ?? null,
      sessionId: payload.sessionId,
      phase: "sub-agent",
      componentKind: "trigger-task",
      componentId: "pipeline-skill-learner",
      eventType: "invoke",
      status: "started",
      audience,
      scope,
      brandId,
      payload: {
        receivedCount: payload.skillSuggestions.length,
        cognitionPlan: payload.cognitionResult.plan,
      },
    });

    skillCandidatesStore.load();

    const receivedCount = payload.skillSuggestions.length;
    if (receivedCount === 0) {
      logger.info("Skill learner skipped: no suggestions");
      await agentAuditStore.record({
        pipelineRunId,
        runId: requestContext?.runId ?? null,
        sessionId: payload.sessionId,
        phase: "sub-agent",
        componentKind: "trigger-task",
        componentId: "pipeline-skill-learner",
        eventType: "skipped",
        status: "completed",
        audience,
        scope,
        brandId,
        payload: {
          reason: "no-suggestions",
        },
      });
      return {
        receivedCount,
        persistedCount: 0,
        droppedCount: 0,
        materializations: [],
        issues: [],
      };
    }

    const prepared = prepareAutonomousSkillSuggestionsForPersistence(
      payload.skillSuggestions,
      payload.cognitionResult,
      payload.context.requestContext,
      { maxSuggestions: 1 }
    );

    await agentAuditStore.record({
      pipelineRunId,
      runId: requestContext?.runId ?? null,
      sessionId: payload.sessionId,
      phase: "sub-agent",
      componentKind: "trigger-task",
      componentId: "pipeline-skill-learner",
      eventType: "decision",
      status: "completed",
      audience,
      scope,
      brandId,
      payload: {
        receivedCount,
        acceptedCount: prepared.suggestions.length,
        droppedCount: prepared.droppedCount,
        lockedToCandidateId: prepared.lockedToCandidateId ?? null,
      },
    });

    if (prepared.suggestions.length === 0) {
      logger.info("Skill learner skipped: all suggestions dropped", {
        sessionId: payload.sessionId,
        received: receivedCount,
        dropped: prepared.droppedCount,
        lockedToCandidate: prepared.lockedToCandidateId,
      });
      await agentAuditStore.record({
        pipelineRunId,
        runId: requestContext?.runId ?? null,
        sessionId: payload.sessionId,
        phase: "sub-agent",
        componentKind: "trigger-task",
        componentId: "pipeline-skill-learner",
        eventType: "skipped",
        status: "completed",
        audience,
        scope,
        brandId,
        payload: {
          reason: "filtered-to-zero",
          droppedCount: prepared.droppedCount,
          lockedToCandidateId: prepared.lockedToCandidateId ?? null,
        },
      });
      return {
        receivedCount,
        persistedCount: 0,
        droppedCount: prepared.droppedCount,
        materializations: [],
        issues: [],
      };
    }

    const { materializations, issues } = persistAndMaterializeSkillSuggestions(
      prepared.suggestions,
      payload.context
    );

    logger.info("Skill learner completed", {
      sessionId: payload.sessionId,
      received: receivedCount,
      persisted: prepared.suggestions.length,
      dropped: prepared.droppedCount,
      lockedToCandidate: prepared.lockedToCandidateId,
      successfulMaterializations: materializations.filter((item) => item.success)
        .length,
    });

    if (issues.length > 0) {
      logger.warn("Skill learner completed with issues", {
        sessionId: payload.sessionId,
        issues,
      });
    }

    await agentAuditStore.record({
      pipelineRunId,
      runId: requestContext?.runId ?? null,
      sessionId: payload.sessionId,
      phase: "sub-agent",
      componentKind: "trigger-task",
      componentId: "pipeline-skill-learner",
      eventType: "result",
      status: issues.length > 0 ? "warning" : "completed",
      audience,
      scope,
      brandId,
      payload: {
        receivedCount,
        persistedCount: prepared.suggestions.length,
        droppedCount: prepared.droppedCount,
        lockedToCandidateId: prepared.lockedToCandidateId ?? null,
        materializations,
        issues,
      },
    });

    return {
      receivedCount,
      persistedCount: prepared.suggestions.length,
      droppedCount: prepared.droppedCount,
      materializations,
      issues,
    };
  },
});
