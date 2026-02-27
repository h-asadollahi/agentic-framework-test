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
   * Execute a sub-agent with input validation.
   */
  async execute(
    agentId: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<AgentResult> {
    const agent = this.getOrThrow(agentId);

    // Validate input against the plugin's schema
    const parseResult = agent.inputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new SubAgentValidationError(agentId, parseResult.error);
    }

    logger.info(`Executing sub-agent "${agentId}"`, {
      agent: agentId,
      inputKeys: Object.keys(input as Record<string, unknown>),
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
