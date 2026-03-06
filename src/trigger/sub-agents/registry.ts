import type { SubAgentPlugin, ExecutionContext, AgentResult } from "../../core/types.js";
import { SubAgentNotFoundError, SubAgentValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

/**
 * Sub-Agent Plugin Registry
 *
 * A central registry where domain-specific sub-agents register themselves.
 * The Agency stage uses this to discover and execute sub-agents.
 *
 * Supports:
 * - register/unregister plugins
 * - lookup by ID or capability
 * - execute with input validation (Zod schemas)
 */
class SubAgentRegistryImpl {
  private agents: Map<string, SubAgentPlugin> = new Map();

  /**
   * Register a sub-agent plugin.
   */
  register(plugin: SubAgentPlugin): void {
    if (this.agents.has(plugin.id)) {
      logger.warn(`Sub-agent "${plugin.id}" already registered, replacing`);
    }
    this.agents.set(plugin.id, plugin);
    logger.info(`Sub-agent registered: ${plugin.id} (${plugin.name} v${plugin.version})`, {
      capabilities: plugin.capabilities,
    });
  }

  /**
   * Unregister a sub-agent.
   */
  unregister(id: string): boolean {
    const deleted = this.agents.delete(id);
    if (deleted) {
      logger.info(`Sub-agent unregistered: ${id}`);
    }
    return deleted;
  }

  /**
   * Get a sub-agent by ID.
   */
  get(id: string): SubAgentPlugin | undefined {
    return this.agents.get(id);
  }

  /**
   * Get a sub-agent by ID, throwing if not found.
   */
  getOrThrow(id: string): SubAgentPlugin {
    const agent = this.agents.get(id);
    if (!agent) throw new SubAgentNotFoundError(id);
    return agent;
  }

  /**
   * List all registered sub-agents.
   */
  list(): SubAgentPlugin[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find sub-agents that have a specific capability.
   */
  findByCapability(capability: string): SubAgentPlugin[] {
    return this.list().filter((a) => a.capabilities.includes(capability));
  }

  /**
   * Check if a sub-agent is registered.
   */
  has(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Normalize raw input from the cognition agent before Zod validation.
   *
   * The cognition LLM may produce:
   *   - a plain string  → wrap in { description: string }
   *   - null/undefined   → empty object (let schema defaults apply)
   *   - an object        → pass through as-is
   */
  private normalizeInput(input: unknown): Record<string, unknown> {
    if (typeof input === "string") {
      return { description: input };
    }
    if (input === null || input === undefined) {
      return {};
    }
    if (typeof input === "object" && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    return { value: input };
  }

  /**
   * Execute a sub-agent with input normalization and validation.
   */
  async execute(
    agentId: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<AgentResult> {
    const agent = this.getOrThrow(agentId);

    // Normalize before validation so string / null inputs don't crash
    const normalizedInput = this.normalizeInput(input);

    // Validate input against the plugin's schema
    const parseResult = agent.inputSchema.safeParse(normalizedInput);
    if (!parseResult.success) {
      logger.warn(`Sub-agent "${agentId}" input validation failed, using raw input`, {
        agent: agentId,
        errors: parseResult.error.flatten(),
      });
      // Fallback: pass the normalised input directly to the agent.
      // The agent's own execute() should handle gracefully.
      const startTime = Date.now();
      const result = await agent.execute(normalizedInput, context);
      return { ...result, durationMs: Date.now() - startTime };
    }

    logger.info(`Executing sub-agent "${agentId}"`, {
      agent: agentId,
      inputKeys: Object.keys(normalizedInput),
    });

    const startTime = Date.now();
    const result = await agent.execute(parseResult.data, context);
    const durationMs = Date.now() - startTime;

    logger.info(`Sub-agent "${agentId}" completed`, {
      agent: agentId,
      success: result.success,
      model: result.modelUsed,
      durationMs,
    });

    return { ...result, durationMs };
  }

  /**
   * Get a summary of all registered agents (useful for the Cognition agent).
   */
  getSummary(): Array<{ id: string; name: string; description: string; capabilities: string[] }> {
    return this.list().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
    }));
  }
}

/**
 * Singleton registry instance.
 */
export const subAgentRegistry = new SubAgentRegistryImpl();
