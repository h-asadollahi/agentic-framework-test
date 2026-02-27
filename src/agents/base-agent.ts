import { generateText, type LanguageModel, type Tool } from "ai";
import type { AgentConfig, AgentResult, ExecutionContext } from "../core/types.js";
import { AllModelsFailedError } from "../core/errors.js";
import { ModelRouter, modelRouter } from "../providers/model-router.js";
import { logger } from "../core/logger.js";

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

  /**
   * Execute the agent with model fallback.
   *
   * Iterates through [preferred, ...fallbacks]. If all fail, throws
   * AllModelsFailedError which triggers human-in-the-loop escalation.
   */
  async execute(input: string, context: ExecutionContext): Promise<AgentResult> {
    const modelIds = this.router.getModelsForAgent(this.config.id);
    const errors: Array<{ modelId: string; error: unknown }> = [];

    for (const modelId of modelIds) {
      try {
        logger.info(`Agent "${this.config.id}" trying model "${modelId}"`, {
          agent: this.config.id,
          model: modelId,
        });

        const model: LanguageModel = this.router.resolve(modelId);
        const tools = this.getTools(context);
        const hasTools = Object.keys(tools).length > 0;

        const result = await generateText({
          model,
          system: this.buildSystemPrompt(context),
          prompt: input,
          ...(hasTools ? { tools, maxSteps: this.config.maxSteps } : {}),
          temperature: this.config.temperature,
        });

        logger.info(`Agent "${this.config.id}" succeeded with model "${modelId}"`, {
          agent: this.config.id,
          model: modelId,
          tokens: result.usage?.totalTokens,
          steps: result.steps?.length,
        });

        return {
          success: true,
          output: result.text,
          modelUsed: modelId,
          tokensUsed: result.usage?.totalTokens,
          steps: result.steps?.length ?? 1,
        };
      } catch (error) {
        logger.warn(
          `Agent "${this.config.id}" failed with model "${modelId}": ${error instanceof Error ? error.message : String(error)}`,
          { agent: this.config.id, model: modelId }
        );
        errors.push({ modelId, error });
      }
    }

    // All models failed
    logger.error(`Agent "${this.config.id}": all models exhausted`, {
      agent: this.config.id,
      attempts: errors.length,
    });

    throw new AllModelsFailedError(this.config.id, modelIds);
  }
}
