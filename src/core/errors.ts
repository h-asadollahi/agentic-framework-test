import type { HumanEscalation } from "./types.js";

/**
 * Thrown when all model fallbacks have been exhausted for an agent.
 */
export class AllModelsFailedError extends Error {
  public readonly agentId: string;
  public readonly attemptedModels: string[];

  constructor(agentId: string, attemptedModels: string[]) {
    super(
      `All models failed for agent "${agentId}". Attempted: ${attemptedModels.join(", ")}`
    );
    this.name = "AllModelsFailedError";
    this.agentId = agentId;
    this.attemptedModels = attemptedModels;
  }
}

/**
 * Thrown when a sub-agent is not found in the registry.
 */
export class SubAgentNotFoundError extends Error {
  public readonly agentId: string;

  constructor(agentId: string) {
    super(`Sub-agent "${agentId}" not found in registry`);
    this.name = "SubAgentNotFoundError";
    this.agentId = agentId;
  }
}

/**
 * Thrown when input validation fails for a sub-agent.
 */
export class SubAgentValidationError extends Error {
  public readonly agentId: string;
  public readonly validationErrors: unknown;

  constructor(agentId: string, validationErrors: unknown) {
    super(`Input validation failed for sub-agent "${agentId}"`);
    this.name = "SubAgentValidationError";
    this.agentId = agentId;
    this.validationErrors = validationErrors;
  }
}

/**
 * Thrown when a guardrail constraint is violated.
 */
export class GuardrailViolationError extends Error {
  public readonly constraint: string;
  public readonly agentId: string;

  constructor(agentId: string, constraint: string) {
    super(
      `Guardrail violation in agent "${agentId}": ${constraint}`
    );
    this.name = "GuardrailViolationError";
    this.agentId = agentId;
    this.constraint = constraint;
  }
}

/**
 * Build a HumanEscalation object from an error context.
 */
export function buildEscalation(params: {
  runId: string;
  taskDescription: string;
  error: Error;
  severity?: HumanEscalation["severity"];
  notifyMarketer?: boolean;
  notifyAdmin?: boolean;
}): HumanEscalation {
  return {
    runId: params.runId,
    taskDescription: params.taskDescription,
    reason: params.error.message,
    severity: params.severity ?? "error",
    notifyMarketer: params.notifyMarketer ?? true,
    notifyAdmin: params.notifyAdmin ?? true,
    context: {
      errorName: params.error.name,
      stack: params.error.stack,
    },
  };
}
