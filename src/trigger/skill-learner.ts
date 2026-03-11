import { task, logger } from "@trigger.dev/sdk/v3";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
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
    skillCandidatesStore.load();

    const receivedCount = payload.skillSuggestions.length;
    if (receivedCount === 0) {
      logger.info("Skill learner skipped: no suggestions");
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
      { maxSuggestions: 1 }
    );

    if (prepared.suggestions.length === 0) {
      logger.info("Skill learner skipped: all suggestions dropped", {
        sessionId: payload.sessionId,
        received: receivedCount,
        dropped: prepared.droppedCount,
        lockedToCandidate: prepared.lockedToCandidateId,
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

    return {
      receivedCount,
      persistedCount: prepared.suggestions.length,
      droppedCount: prepared.droppedCount,
      materializations,
      issues,
    };
  },
});
