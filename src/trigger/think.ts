import { task, logger } from "@trigger.dev/sdk/v3";
import { cognitionAgent } from "../agents/cognition-agent.js";
import type { CognitionResult, GroundingResult, SubTask } from "../core/types.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import {
  buildRejectedCognitionResult,
  detectCognitionGuardrailRejection,
} from "./cognition-guardrails.js";
import { parseAgentJson } from "./agent-output-parser.js";

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
  }) => {
    logger.info("Starting cognition phase");

    // pipeline-think runs in its own task process; always preload DB-backed
    // route/skill stores before cognition prompt construction.
    await preloadCognitionStores();

    const context = payload.groundingResult.context;

    const input = JSON.stringify({
      userMessage: payload.userMessage,
      brandIdentity: payload.groundingResult.brandIdentity,
      guardrails: payload.groundingResult.guardrails,
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
    }

    // Deterministic guardrail fallback in case the model misses rejection policy.
    const guardrailDecision = detectCognitionGuardrailRejection(
      payload.userMessage
    );
    if (guardrailDecision.rejected) {
      cognitionResult = buildRejectedCognitionResult(
        guardrailDecision.reason ??
          "Request is out of scope for this marketing assistant."
      );
    }

    if (cognitionResult.rejected === true) {
      const reason =
        cognitionResult.rejectionReason ??
        "Request rejected by cognition guardrails.";
      cognitionResult = buildRejectedCognitionResult(reason);
    }

    if (cognitionResult.rejected !== true) {
      cognitionResult = applyAutonomousSkillCreation(
        cognitionResult,
        payload.userMessage
      );
    }

    logger.info(`Cognition produced ${cognitionResult.subtasks.length} subtasks`);
    return cognitionResult;
  },
});

export async function preloadCognitionStores(): Promise<void> {
  await learnedRoutesStore.load();
  skillCandidatesStore.load();
}

export function applyAutonomousSkillCreation(
  cognitionResult: CognitionResult,
  userMessage: string
): CognitionResult {
  const matchedCandidate = skillCandidatesStore.findBestMatchByPrompt(userMessage);
  if (!matchedCandidate) return cognitionResult;

  skillCandidatesStore.incrementUsage(matchedCandidate.id);

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
  const lower = description.toLowerCase();
  return [
    "summarize",
    "summary",
    "synthesize",
    "consolidate",
    "rollup",
    "roll-up",
    "aggregate",
    "narrative",
    "recommendation",
    "combine",
    "compile",
    "final answer",
  ].some((signal) => lower.includes(signal));
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
