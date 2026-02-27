import { describe, it, expect } from "vitest";
import {
  AllModelsFailedError,
  SubAgentNotFoundError,
  SubAgentValidationError,
  GuardrailViolationError,
  buildEscalation,
} from "../../src/core/errors.js";

describe("Custom Errors", () => {
  it("AllModelsFailedError includes agent and models", () => {
    const err = new AllModelsFailedError("grounding", [
      "anthropic:fast",
      "openai:fast",
    ]);

    expect(err.name).toBe("AllModelsFailedError");
    expect(err.agentId).toBe("grounding");
    expect(err.attemptedModels).toEqual(["anthropic:fast", "openai:fast"]);
    expect(err.message).toContain("grounding");
    expect(err.message).toContain("anthropic:fast");
  });

  it("SubAgentNotFoundError includes agent ID", () => {
    const err = new SubAgentNotFoundError("unknown-agent");
    expect(err.name).toBe("SubAgentNotFoundError");
    expect(err.agentId).toBe("unknown-agent");
    expect(err.message).toContain("unknown-agent");
  });

  it("SubAgentValidationError includes details", () => {
    const err = new SubAgentValidationError("cohort-monitor", {
      issues: ["missing field"],
    });
    expect(err.name).toBe("SubAgentValidationError");
    expect(err.agentId).toBe("cohort-monitor");
    expect(err.validationErrors).toEqual({ issues: ["missing field"] });
  });

  it("GuardrailViolationError includes constraint", () => {
    const err = new GuardrailViolationError("interface", "Never mention competitors");
    expect(err.name).toBe("GuardrailViolationError");
    expect(err.agentId).toBe("interface");
    expect(err.constraint).toBe("Never mention competitors");
  });
});

describe("buildEscalation", () => {
  it("builds an escalation object from error context", () => {
    const error = new AllModelsFailedError("grounding", ["model-a"]);
    const escalation = buildEscalation({
      runId: "run-123",
      taskDescription: "Analyse cohort",
      error,
      severity: "critical",
    });

    expect(escalation.runId).toBe("run-123");
    expect(escalation.taskDescription).toBe("Analyse cohort");
    expect(escalation.reason).toContain("grounding");
    expect(escalation.severity).toBe("critical");
    expect(escalation.notifyMarketer).toBe(true);
    expect(escalation.notifyAdmin).toBe(true);
    expect(escalation.context.errorName).toBe("AllModelsFailedError");
  });

  it("uses defaults for optional fields", () => {
    const escalation = buildEscalation({
      runId: "run-456",
      taskDescription: "test",
      error: new Error("something broke"),
    });

    expect(escalation.severity).toBe("error");
    expect(escalation.notifyMarketer).toBe(true);
    expect(escalation.notifyAdmin).toBe(true);
  });
});
