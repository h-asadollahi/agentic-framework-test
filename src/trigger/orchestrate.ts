import { task, logger } from "@trigger.dev/sdk/v3";
import { groundTask } from "./ground.js";
import { thinkTask } from "./think.js";
import { executeTask } from "./execute.js";
import { deliverTask } from "./deliver.js";
import { skillLearnerTask } from "./skill-learner.js";
import { notifyTask } from "./notify.js";
import { escalateTask } from "./escalate.js";
import { shortTermMemory } from "../memory/short-term.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { llmUsageStore } from "../observability/llm-usage-store.js";
import { withPipelineRunId } from "../core/request-context.js";
import type {
  CognitionResult,
  ExecutionContext,
  PipelinePayload,
  PipelineResult,
  SkillSuggestion,
  TraceEntry,
} from "../core/types.js";

type QueueSkillLearnerInput = {
  sessionId: string;
  cognitionResult: CognitionResult;
  context: ExecutionContext;
  skillSuggestions: SkillSuggestion[];
};

export function queueSkillLearnerInBackground(
  payload: QueueSkillLearnerInput,
  triggerFn: typeof skillLearnerTask.trigger = skillLearnerTask.trigger
): void {
  // Fire-and-forget: never block marketer-facing delivery on autonomous learning.
  void triggerFn(payload).catch((error) => {
    logger.warn("Failed to queue asynchronous skill learner", {
      sessionId: payload.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Orchestrate Task
 *
 * Top-level pipeline task that coordinates the four guardrail stages:
 *   Grounding → Cognition → Agency → Interface
 *
 * Each stage is a separate trigger.dev task called via triggerAndWait(),
 * giving us:
 * - Durable execution (no timeouts)
 * - Per-stage retry with fallback
 * - Real-time status streaming via Realtime API
 * - Full observability in the trigger.dev dashboard
 */
export const orchestrateTask = task({
  id: "orchestrate-pipeline",
  retry: { maxAttempts: 1 }, // orchestrator itself doesn't retry; stages do
  run: async (payload: PipelinePayload, taskContext): Promise<PipelineResult> => {
    // Reload learned routes from disk (picks up manual edits)
    await learnedRoutesStore.load();
    // Reload skill candidates from disk (picks up manual edits / admin curation)
    skillCandidatesStore.load();

    const trace: TraceEntry[] = [];
    const startTime = Date.now();
    const requestContext = withPipelineRunId(
      payload.requestContext,
      taskContext.ctx.run.id
    );
    const pipelineRunId = requestContext.pipelineRunId ?? payload.sessionId;

    try {
      await llmUsageStore.createPromptRun({
        pipelineRunId,
        audience: requestContext.audience,
        scope: requestContext.scope,
        brandId: requestContext.brandId,
        source: requestContext.source,
        sessionId: payload.sessionId,
        userPrompt: payload.userMessage,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn("Failed to create prompt-level LLM usage run", {
        pipelineRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("Pipeline started", {
      sessionId: payload.sessionId,
      message: payload.userMessage.slice(0, 100),
    });

    const rememberAssistantReply = (content: string): void => {
      shortTermMemory.addMessage(payload.sessionId, {
        role: "assistant",
        content,
        metadata: {
          audience: requestContext.audience,
          brandId: requestContext.brandId,
          scope: requestContext.scope,
          source: requestContext.source,
          pipelineRunId: requestContext.pipelineRunId,
        },
      });
    };

    const escalateStageFailure = async (stage: string, reason: string, details: unknown) => {
      try {
        await escalateTask.trigger({
          escalation: {
            runId: payload.sessionId,
            taskDescription: `${stage} stage failure`,
            reason,
            severity: "error",
            notifyMarketer: true,
            notifyAdmin: true,
            context: {
              stage,
              userMessage: payload.userMessage,
              error: details,
            },
          },
          timeoutMinutes: 60,
        });
      } catch (escalationError) {
        logger.warn(`Escalation trigger failed after ${stage} failure`, {
          stage,
          error:
            escalationError instanceof Error
              ? escalationError.message
              : String(escalationError),
        });
      }
    };

    try {
      // ── Stage 1: Grounding ─────────────────────────────────
      logger.info("Stage 1/4: Grounding");
      const groundingStart = Date.now();

      const groundingRun = await groundTask.triggerAndWait({
        userMessage: payload.userMessage,
        sessionId: payload.sessionId,
        requestContext,
      });

      if (!groundingRun.ok) {
        await escalateStageFailure("grounding", "Grounding stage execution failed", groundingRun.error);
        throw new Error(`Grounding stage failed: ${JSON.stringify(groundingRun.error)}`);
      }

      trace.push({
        timestamp: new Date(),
        phase: "grounding",
        agent: "grounding",
        action: "Established brand context and guardrails",
        durationMs: Date.now() - groundingStart,
      });

      // ── Stage 2: Cognition ─────────────────────────────────
      logger.info("Stage 2/4: Cognition");
      const cognitionStart = Date.now();

      const thinkRun = await thinkTask.triggerAndWait({
        userMessage: payload.userMessage,
        groundingResult: groundingRun.output,
      });

      if (!thinkRun.ok) {
        await escalateStageFailure("cognition", "Cognition stage execution failed", thinkRun.error);
        throw new Error(`Cognition stage failed: ${JSON.stringify(thinkRun.error)}`);
      }

      trace.push({
        timestamp: new Date(),
        phase: "cognition",
        agent: "cognition",
        action: `Decomposed into ${thinkRun.output.subtasks.length} subtasks`,
        reasoning: thinkRun.output.reasoning,
        durationMs: Date.now() - cognitionStart,
      });

      if (thinkRun.output.rejected === true) {
        const rejectionMessage =
          thinkRun.output.rejectionReason ??
          "I can’t help with this request because it is outside the supported marketing scope.";

        logger.info("Pipeline stopped at cognition due to guardrail rejection", {
          sessionId: payload.sessionId,
        });

        rememberAssistantReply(rejectionMessage);
        try {
          await llmUsageStore.finalizePromptRun(pipelineRunId, "rejected");
        } catch (error) {
          logger.warn("Failed to finalize rejected prompt-level LLM usage run", {
            pipelineRunId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return {
          formattedResponse: rejectionMessage,
          notifications: [],
          trace,
        };
      }

      // ── Stage 3: Agency ────────────────────────────────────
      logger.info("Stage 3/4: Agency", {
        subtasks: thinkRun.output.subtasks.length,
      });
      const agencyStart = Date.now();

      const executeRun = await executeTask.triggerAndWait({
        cognitionResult: thinkRun.output,
        context: groundingRun.output.context,
      });

      if (!executeRun.ok) {
        await escalateStageFailure("agency", "Agency stage execution failed", executeRun.error);
        throw new Error(`Agency stage failed: ${JSON.stringify(executeRun.error)}`);
      }

      trace.push({
        timestamp: new Date(),
        phase: "agency",
        agent: "agency",
        action: executeRun.output.summary,
        durationMs: Date.now() - agencyStart,
      });

      const skillSuggestions = executeRun.output.skillSuggestions ?? [];
      if (skillSuggestions.length > 0) {
        logger.info("Queueing asynchronous skill learner", {
          sessionId: payload.sessionId,
          suggestions: skillSuggestions.length,
        });
        trace.push({
          timestamp: new Date(),
          phase: "orchestration",
          agent: "skill-learner",
          action: `Queued asynchronous skill-learning for ${skillSuggestions.length} suggestion(s)`,
        });

        queueSkillLearnerInBackground({
          sessionId: payload.sessionId,
          cognitionResult: thinkRun.output,
          context: groundingRun.output.context,
          skillSuggestions,
        });
      }

      // ── Stage 4: Interface ─────────────────────────────────
      logger.info("Stage 4/4: Interface");
      const interfaceStart = Date.now();

      const deliverRun = await deliverTask.triggerAndWait({
        agencyResult: executeRun.output,
        cognitionResult: thinkRun.output,
        context: groundingRun.output.context,
      });

      if (!deliverRun.ok) {
        await escalateStageFailure("interface", "Interface stage execution failed", deliverRun.error);
        throw new Error(`Interface stage failed: ${JSON.stringify(deliverRun.error)}`);
      }

      trace.push({
        timestamp: new Date(),
        phase: "interface",
        agent: "interface",
        action: "Formatted response and determined notifications",
        durationMs: Date.now() - interfaceStart,
      });

      // ── Send Notifications ─────────────────────────────────
      const notifications = deliverRun.output.notifications ?? [];
      if (notifications.length > 0) {
        logger.info(`Sending ${notifications.length} notification(s)`);
        for (const notification of notifications) {
          // Fire-and-forget — don't block the pipeline response
          await notifyTask.trigger({
            notification: {
              ...notification,
              metadata: {
                ...(notification.metadata ?? {}),
                requestContext,
                sessionId: payload.sessionId,
              },
            },
          });
        }
      }

      // ── Done ───────────────────────────────────────────────
      const totalMs = Date.now() - startTime;
      logger.info("Pipeline complete", {
        totalMs,
        stages: trace.length,
        notifications: notifications.length,
      });

      rememberAssistantReply(deliverRun.output.formattedResponse);
      try {
        await llmUsageStore.finalizePromptRun(pipelineRunId, "completed");
      } catch (error) {
        logger.warn("Failed to finalize completed prompt-level LLM usage run", {
          pipelineRunId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return {
        formattedResponse: deliverRun.output.formattedResponse,
        notifications,
        trace,
      };
    } catch (error) {
      try {
        await llmUsageStore.finalizePromptRun(pipelineRunId, "failed");
      } catch (finalizeError) {
        logger.warn("Failed to finalize failed prompt-level LLM usage run", {
          pipelineRunId,
          error:
            finalizeError instanceof Error
              ? finalizeError.message
              : String(finalizeError),
        });
      }
      throw error;
    }
  },
});
