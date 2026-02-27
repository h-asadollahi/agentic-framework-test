import { generateText, type Tool } from "ai";
import { z } from "zod";
import type { SubAgentPlugin, ExecutionContext, AgentResult } from "../../core/types.js";
import { modelRouter } from "../../providers/model-router.js";
import { logger } from "../../core/logger.js";

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
    preferredModel: string = "anthropic:balanced",
    fallbackModels: string[] = ["openai:balanced", "google:balanced"],
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

  /**
   * Execute the sub-agent with model fallback.
   */
  async execute(input: unknown, context: ExecutionContext): Promise<AgentResult> {
    const models = [this.preferredModel, ...this.fallbackModels];

    for (const modelId of models) {
      try {
        const model = modelRouter.resolve(modelId);
        const tools = this.getTools(context);
        const hasTools = Object.keys(tools).length > 0;

        const result = await generateText({
          model,
          system: this.getSystemPrompt(context),
          prompt: JSON.stringify(input),
          ...(hasTools ? { tools, maxSteps: this.maxSteps } : {}),
          temperature: this.temperature,
        });

        return {
          success: true,
          output: result.text,
          modelUsed: modelId,
          tokensUsed: result.usage?.totalTokens,
          steps: result.steps?.length ?? 1,
        };
      } catch (error) {
        logger.warn(`Sub-agent "${this.id}" failed with model "${modelId}": ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    return {
      success: false,
      output: null,
      modelUsed: "none",
    };
  }
}
