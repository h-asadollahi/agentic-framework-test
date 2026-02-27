import { task, logger } from "@trigger.dev/sdk/v3";
import { groundTask } from "./ground.js";
import { thinkTask } from "./think.js";
import { executeTask } from "./execute.js";
import { deliverTask } from "./deliver.js";
import { notifyTask } from "./notify.js";
import type { PipelinePayload, PipelineResult, TraceEntry } from "../core/types.js";

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
  run: async (payload: PipelinePayload): Promise<PipelineResult> => {
    const trace: TraceEntry[] = [];
    const startTime = Date.now();

    logger.info("Pipeline started", {
      sessionId: payload.sessionId,
      message: payload.userMessage.slice(0, 100),
    });

    // ── Stage 1: Grounding ─────────────────────────────────
    logger.info("Stage 1/4: Grounding");
    const groundingStart = Date.now();

    const groundingRun = await groundTask.triggerAndWait({
      userMessage: payload.userMessage,
      sessionId: payload.sessionId,
    });

    if (!groundingRun.ok) {
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
      throw new Error(`Agency stage failed: ${JSON.stringify(executeRun.error)}`);
    }

    trace.push({
      timestamp: new Date(),
      phase: "agency",
      agent: "agency",
      action: executeRun.output.summary,
      durationMs: Date.now() - agencyStart,
    });

    // ── Stage 4: Interface ─────────────────────────────────
    logger.info("Stage 4/4: Interface");
    const interfaceStart = Date.now();

    const deliverRun = await deliverTask.triggerAndWait({
      agencyResult: executeRun.output,
      context: groundingRun.output.context,
    });

    if (!deliverRun.ok) {
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
        await notifyTask.trigger({ notification });
      }
    }

    // ── Done ───────────────────────────────────────────────
    const totalMs = Date.now() - startTime;
    logger.info("Pipeline complete", {
      totalMs,
      stages: trace.length,
      notifications: notifications.length,
    });

    return {
      formattedResponse: deliverRun.output.formattedResponse,
      notifications,
      trace,
    };
  },
});
