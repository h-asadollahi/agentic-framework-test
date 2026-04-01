import { z } from "zod";
import type { Tool } from "ai";
import type { AgentResult, ExecutionContext } from "../../../core/types.js";
import { llmUsageStore } from "../../../observability/llm-usage-store.js";
import { agentAuditStore } from "../../../observability/agent-audit-store.js";
import { BaseSubAgent } from "../base-sub-agent.js";
import { subAgentRegistry } from "../registry.js";

const TokenUsageMonitorInput = z
  .object({
    audience: z.enum(["admin", "marketer"]).optional().default("marketer"),
    brandId: z.string().trim().min(1).optional().nullable(),
    days: z.number().int().min(1).max(365).optional().default(7),
    bucket: z.enum(["day"]).optional().default("day"),
  })
  .passthrough();

const TokenUsageMonitorOutput = z.object({
  audience: z.enum(["admin", "marketer"]),
  brandId: z.string().nullable(),
  days: z.number().int().min(1).max(365),
  bucket: z.enum(["day"]),
  totalPrompts: z.number().int().nonnegative(),
  totalLlmCalls: z.number().int().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCalls: z.number().int().nonnegative(),
  byProvider: z.array(
    z.object({
      provider: z.string(),
      tokens: z.number().int().nonnegative(),
      calls: z.number().int().nonnegative(),
    })
  ),
  byModel: z.array(
    z.object({
      model: z.string(),
      tokens: z.number().int().nonnegative(),
      calls: z.number().int().nonnegative(),
    })
  ),
  daily: z.array(
    z.object({
      bucket: z.string(),
      promptCount: z.number().int().nonnegative(),
      llmCallCount: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      tokens: z.number().int().nonnegative(),
      calls: z.number().int().nonnegative(),
    })
  ),
  note: z.string(),
});

export class TokenUsageMonitorAgent extends BaseSubAgent {
  id = "token-usage-monitor";
  name = "Token Usage Monitor";
  description =
    "Aggregates forward-only LLM token telemetry across providers, models, and daily buckets for admin observability.";
  version = "1.0.0";
  capabilities = [
    "llm-token-usage",
    "admin-observability",
    "telemetry-reporting",
  ];

  inputSchema = TokenUsageMonitorInput;
  outputSchema = TokenUsageMonitorOutput;

  constructor() {
    super("openai:fast", ["anthropic:fast", "google:fast"], 1, 0);
  }

  async execute(input: unknown, _context: ExecutionContext): Promise<AgentResult> {
    const context = _context;
    const pipelineRunId = context.requestContext.pipelineRunId ?? context.sessionId;
    const runId = context.requestContext.runId ?? context.sessionId;
    const auditBase = {
      pipelineRunId,
      runId,
      sessionId: context.sessionId,
      phase: "sub-agent",
      componentKind: "sub-agent" as const,
      componentId: this.id,
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
      brandId: context.requestContext.brandId,
    };
    const parsed = TokenUsageMonitorInput.safeParse(input);
    const request = parsed.success ? parsed.data : TokenUsageMonitorInput.parse({});
    await agentAuditStore.record({
      ...auditBase,
      eventType: "invoke",
      status: "running",
      payload: { input: request },
    });
    const summary = await llmUsageStore.getSummary({
      audience: request.audience,
      brandId: request.brandId ?? null,
      days: request.days,
    });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "decision",
      status: "completed",
      payload: {
        decision: "deterministic-telemetry-query",
        audience: request.audience,
        brandId: request.brandId ?? null,
        days: request.days,
      },
    });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "result",
      status: "completed",
      payload: {
        audience: request.audience,
        brandId: request.brandId ?? null,
        days: request.days,
        totalPrompts: summary.totalPrompts,
        totalLlmCalls: summary.totalLlmCalls,
        totalTokens: summary.totalTokens,
        byProvider: summary.byProvider,
        byModel: summary.byModel,
      },
    });

    return {
      success: true,
      output: JSON.stringify({
        audience: request.audience,
        brandId: request.brandId ?? null,
        days: request.days,
        bucket: request.bucket,
        totalPrompts: summary.totalPrompts,
        totalLlmCalls: summary.totalLlmCalls,
        totalInputTokens: summary.totalInputTokens,
        totalOutputTokens: summary.totalOutputTokens,
        totalTokens: summary.totalTokens,
        totalCalls: summary.totalCalls,
        byProvider: summary.byProvider,
        byModel: summary.byModel,
        daily: summary.daily,
        note: "Telemetry is forward-only from the time LLM usage tracking was enabled.",
      }),
      modelUsed: "telemetry-db",
    };
  }

  getSystemPrompt(_context: ExecutionContext): string {
    return "You aggregate LLM usage telemetry deterministically.";
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return {};
  }

  protected override getPromptSourceIdentifier(): string | null {
    return "deterministic-inline";
  }
}

subAgentRegistry.register(new TokenUsageMonitorAgent());
