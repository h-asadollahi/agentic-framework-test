import { generateText, type Tool } from "ai";
import { z } from "zod";
import type { SubAgentPlugin, ExecutionContext, AgentResult } from "../../core/types.js";
import {
  modelRouter,
  modelSupportsTemperature,
  resolveModelId,
} from "../../providers/model-router.js";
import { logger } from "../../core/logger.js";
import { llmUsageStore } from "../../observability/llm-usage-store.js";
import { agentAuditStore } from "../../observability/agent-audit-store.js";

/**
 * Base class for domain-specific sub-agents.
 *
 * Provides the same model-fallback pattern as BaseAgent but tailored for
 * sub-agents that run within the Agency stage.
 *
 * To create a new sub-agent plugin:
 * 1. Extend this class
 * 2. Set id, name, description, version, capabilities
 * 3. Define inputSchema and outputSchema (Zod)
 * 4. Implement getSystemPrompt() and getTools()
 * 5. Register with subAgentRegistry.register(new MyAgent())
 */
export abstract class BaseSubAgent implements SubAgentPlugin {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract version: string;
  abstract capabilities: string[];
  abstract inputSchema: z.ZodType;
  abstract outputSchema: z.ZodType;

  protected preferredModel: string;
  protected fallbackModels: string[];
  protected maxSteps: number;
  protected temperature: number;

  constructor(
    preferredModel: string = "openai:balanced",
    fallbackModels: string[] = ["anthropic:balanced", "google:balanced"],
    maxSteps: number = 10,
    temperature: number = 0.2
  ) {
    this.preferredModel = preferredModel;
    this.fallbackModels = fallbackModels;
    this.maxSteps = maxSteps;
    this.temperature = temperature;
  }

  /**
   * Build the system prompt for this sub-agent.
   */
  abstract getSystemPrompt(context: ExecutionContext): string;

  /**
   * Define the AI SDK tools this sub-agent can use.
   */
  abstract getTools(context: ExecutionContext): Record<string, Tool>;

  protected getAuditPhase(): string {
    return "sub-agent";
  }

  protected getPromptSourceIdentifier(): string | null {
    return null;
  }

  /**
   * Shared instruction for long-term capability creation.
   */
  protected getSkillCreationInstruction(): string {
    return (
      "If you detect a reusable workflow pattern, propose creating a new skill using " +
      "./skills/universal-agent-skill-creator.md and save learned skills under ./skills/learned."
    );
  }

  /**
   * Execute the sub-agent with model fallback.
   */
  async execute(input: unknown, context: ExecutionContext): Promise<AgentResult> {
    const models = [this.preferredModel, ...this.fallbackModels];
    const tools = this.getTools(context);
    const hasTools = Object.keys(tools).length > 0;
    const systemPrompt = this.getSystemPrompt(context);
    const auditBase = {
      pipelineRunId: context.requestContext.pipelineRunId ?? context.sessionId,
      runId: context.requestContext.runId ?? context.sessionId,
      sessionId: context.sessionId,
      phase: this.getAuditPhase(),
      componentKind: "sub-agent" as const,
      componentId: this.id,
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
        candidateModels: models,
      },
    });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "prompt_snapshot",
      status: "captured",
      payload: {
        promptSource: this.getPromptSourceIdentifier(),
        systemPrompt,
        prompt: JSON.stringify(input),
      },
    });

    for (const modelId of models) {
      try {
        const model = modelRouter.resolve(modelId);
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
            maxSteps: hasTools ? this.maxSteps : 0,
          },
        });

        const result = await generateText({
          model,
          system: systemPrompt,
          prompt: JSON.stringify(input),
          ...(hasTools ? { tools, maxSteps: this.maxSteps } : {}),
          ...(supportsTemperature ? { temperature: this.temperature } : {}),
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
            componentKind: "sub-agent",
            componentId: this.id,
            modelAlias: modelId,
            resolvedModelId,
            provider: resolveProvider(resolvedModelId),
            tokensUsed: result.usage?.totalTokens ?? 0,
            promptTokens,
            completionTokens,
          });
        } catch (telemetryError) {
          logger.warn(`Sub-agent "${this.id}" telemetry write failed`, {
            agent: this.id,
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
        logger.warn(`Sub-agent "${this.id}" failed with model "${modelId}": ${error instanceof Error ? error.message : String(error)}`);
        const resolvedModelId = resolveModelId(modelId);
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
        continue;
      }
    }

    await agentAuditStore.record({
      ...auditBase,
      eventType: "error",
      status: "failed",
      payload: {
        message: "All sub-agent models exhausted",
        attemptedModels: models,
      },
    });

    return {
      success: false,
      output: null,
      modelUsed: "none",
    };
  }
}

function resolveProvider(resolvedModelId: string): string {
  const [provider] = resolvedModelId.split(":");
  return provider || "unknown";
}
