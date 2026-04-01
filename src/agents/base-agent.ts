import { generateText, type LanguageModel, type Tool } from "ai";
import type { AgentConfig, AgentResult, ExecutionContext } from "../core/types.js";
import { AllModelsFailedError } from "../core/errors.js";
import {
  ModelRouter,
  modelRouter,
  resolveModelId,
  modelSupportsTemperature,
} from "../providers/model-router.js";
import { logger } from "../core/logger.js";
import { llmUsageStore } from "../observability/llm-usage-store.js";
import { agentAuditStore } from "../observability/agent-audit-store.js";

/**
 * Abstract base class for all agents in the system.
 *
 * Provides:
 * - Model fallback loop (preferred → fallback1 → fallback2 → escalation)
 * - Structured logging (captured by trigger.dev automatically)
 * - Uniform AgentResult return type
 *
 * Subclasses implement:
 * - getTools(): define AI SDK tools available to this agent
 * - buildSystemPrompt(context): construct the system prompt
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected router: ModelRouter;

  constructor(config: AgentConfig, router?: ModelRouter) {
    this.config = config;
    this.router = router ?? modelRouter;
  }

  /**
   * Define the tools this agent can use.
   * Return an empty object if the agent doesn't use tools.
   */
  abstract getTools(context: ExecutionContext): Record<string, Tool>;

  /**
   * Build the system prompt for this agent, incorporating execution context.
   */
  abstract buildSystemPrompt(context: ExecutionContext): string;

  protected getAuditPhase(): string {
    return this.config.id;
  }

  protected getPromptSourceIdentifier(): string | null {
    return null;
  }

  /**
   * Execute the agent with model fallback.
   *
   * Iterates through [preferred, ...fallbacks]. If all fail, throws
   * AllModelsFailedError which triggers human-in-the-loop escalation.
   */
  async execute(input: string, context: ExecutionContext): Promise<AgentResult> {
    const modelIds = this.router.getModelsForAgent(this.config.id);
    const errors: Array<{ modelId: string; error: unknown }> = [];
    const tools = this.getTools(context);
    const hasTools = Object.keys(tools).length > 0;
    const systemPrompt = this.buildSystemPrompt(context);
    const auditBase = {
      pipelineRunId: context.requestContext.pipelineRunId ?? context.sessionId,
      runId: context.requestContext.runId ?? context.sessionId,
      sessionId: context.sessionId,
      phase: this.getAuditPhase(),
      componentKind: "agent" as const,
      componentId: this.config.id,
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
      brandId: context.requestContext.brandId,
    };

    await agentAuditStore.record({
      ...auditBase,
      eventType: "invoke",
      status: "running",
      payload: {
        input,
        hasTools,
        availableTools: Object.keys(tools),
        candidateModels: modelIds,
      },
    });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "prompt_snapshot",
      status: "captured",
      payload: {
        promptSource: this.getPromptSourceIdentifier(),
        systemPrompt,
        prompt: input,
      },
    });

    for (const modelId of modelIds) {
      try {
        logger.info(`Agent "${this.config.id}" trying model "${modelId}"`, {
          agent: this.config.id,
          model: modelId,
        });

        const model: LanguageModel = this.router.resolve(modelId);
        const supportsTemperature = modelSupportsTemperature(modelId);
        const resolvedModelId = resolveModelId(modelId);

        await agentAuditStore.record({
          ...auditBase,
          eventType: "model_attempt",
          status: "started",
          modelAlias: modelId,
          resolvedModelId,
          provider: resolveProvider(resolvedModelId),
          payload: {
            supportsTemperature,
            maxSteps: hasTools ? this.config.maxSteps : 0,
          },
        });

        const result = await generateText({
          model,
          system: systemPrompt,
          prompt: input,
          ...(hasTools ? { tools, maxSteps: this.config.maxSteps } : {}),
          ...(supportsTemperature ? { temperature: this.config.temperature } : {}),
        });

        logger.info(`Agent "${this.config.id}" succeeded with model "${modelId}"`, {
          agent: this.config.id,
          model: modelId,
          tokens: result.usage?.totalTokens,
          steps: result.steps?.length,
        });

        const promptTokens =
          typeof (result.usage as { inputTokens?: number } | undefined)?.inputTokens ===
          "number"
            ? (result.usage as { inputTokens?: number }).inputTokens
            : undefined;
        const completionTokens =
          typeof (result.usage as { outputTokens?: number } | undefined)?.outputTokens ===
          "number"
            ? (result.usage as { outputTokens?: number }).outputTokens
            : undefined;

        try {
          await llmUsageStore.record({
            pipelineRunId: context.requestContext.pipelineRunId,
            audience: context.requestContext.audience,
            scope: context.requestContext.scope,
            brandId: context.requestContext.brandId,
            source: context.requestContext.source,
            sessionId: context.sessionId,
            runId: context.requestContext.runId ?? context.sessionId,
            componentKind: "agent",
            componentId: this.config.id,
            modelAlias: modelId,
            resolvedModelId,
            provider: resolveProvider(resolvedModelId),
            tokensUsed: result.usage?.totalTokens ?? 0,
            promptTokens,
            completionTokens,
          });
        } catch (telemetryError) {
          logger.warn(`Agent "${this.config.id}" telemetry write failed`, {
            agent: this.config.id,
            model: modelId,
            error:
              telemetryError instanceof Error
                ? telemetryError.message
                : String(telemetryError),
          });
        }

        await agentAuditStore.record({
          ...auditBase,
          eventType: "result",
          status: "completed",
          modelAlias: modelId,
          resolvedModelId,
          provider: resolveProvider(resolvedModelId),
          durationMs: undefined,
          tokensUsed: result.usage?.totalTokens ?? 0,
          payload: {
            output: result.text,
            stepCount: result.steps?.length ?? 1,
            promptTokens,
            completionTokens,
          },
        });

        return {
          success: true,
          output: result.text,
          modelUsed: modelId,
          tokensUsed: result.usage?.totalTokens,
          promptTokens,
          completionTokens,
          steps: result.steps?.length ?? 1,
        };
      } catch (error) {
        const resolvedModelId = resolveModelId(modelId);
        logger.warn(
          `Agent "${this.config.id}" failed with model "${modelId}": ${error instanceof Error ? error.message : String(error)}`,
          { agent: this.config.id, model: modelId }
        );
        await agentAuditStore.record({
          ...auditBase,
          eventType: "error",
          status: "failed",
          modelAlias: modelId,
          resolvedModelId,
          provider: resolveProvider(resolvedModelId),
          payload: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        errors.push({ modelId, error });
      }
    }

    // All models failed
    logger.error(`Agent "${this.config.id}": all models exhausted`, {
      agent: this.config.id,
      attempts: errors.length,
    });
    await agentAuditStore.record({
      pipelineRunId: context.requestContext.pipelineRunId ?? context.sessionId,
      runId: context.requestContext.runId ?? context.sessionId,
      sessionId: context.sessionId,
      phase: this.getAuditPhase(),
      componentKind: "agent",
      componentId: this.config.id,
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
      brandId: context.requestContext.brandId,
      eventType: "error",
      status: "failed",
      payload: {
        message: "All models exhausted",
        attempts: errors.map((entry) => ({
          modelId: entry.modelId,
          error:
            entry.error instanceof Error
              ? entry.error.message
              : String(entry.error),
        })),
      },
    });

    throw new AllModelsFailedError(this.config.id, modelIds);
  }
}

function resolveProvider(resolvedModelId: string): string {
  const [provider] = resolvedModelId.split(":");
  return provider || "unknown";
}
