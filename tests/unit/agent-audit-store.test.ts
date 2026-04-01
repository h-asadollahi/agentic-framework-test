import { beforeEach, describe, expect, it, vi } from "vitest";

let currentRepo: Record<string, ReturnType<typeof vi.fn>> | null = null;

vi.mock("../../src/platform/db-repository.js", () => ({
  getPlatformDbRepository: () => currentRepo,
}));

import { agentAuditStore } from "../../src/observability/agent-audit-store.js";

function buildRepo() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    createAgentAuditRun: vi.fn().mockResolvedValue(undefined),
    finalizeAgentAuditRun: vi.fn().mockResolvedValue(undefined),
    recordAgentAuditEvent: vi.fn().mockResolvedValue(undefined),
    listAgentAuditRuns: vi.fn().mockResolvedValue({ total: 1, rows: [] }),
    getAgentAuditRunByPipelineRunId: vi.fn().mockResolvedValue({
      pipelineRunId: "run-1",
      sessionId: "session-1",
      audience: "marketer",
      scope: "brand",
      brandId: "brand-1",
      source: "api",
      userPrompt: "List metrics",
      status: "completed",
      startedAt: "2026-04-01T10:00:00.000Z",
      finishedAt: "2026-04-01T10:00:01.000Z",
      totalEvents: 4,
      totalErrors: 0,
      totalWarnings: 1,
      createdAt: "2026-04-01T10:00:00.000Z",
      updatedAt: "2026-04-01T10:00:01.000Z",
    }),
    listAgentAuditEvents: vi.fn().mockResolvedValue({ total: 1, rows: [] }),
    getAgentAuditSummary: vi.fn().mockResolvedValue({
      totalRuns: 1,
      runningRuns: 0,
      completedRuns: 1,
      failedRuns: 0,
      rejectedRuns: 0,
      totalEvents: 4,
      totalErrors: 0,
      totalWarnings: 1,
      byPhase: [],
      byComponentKind: [],
      byStatus: [],
    }),
    deleteExpiredAgentAuditEvents: vi.fn().mockResolvedValue(3),
  };
}

describe("agentAuditStore", () => {
  beforeEach(() => {
    currentRepo = buildRepo();
  });

  it("creates, records, and finalizes sanitized audit data", async () => {
    await agentAuditStore.createRun({
      pipelineRunId: "run-1",
      sessionId: "session-1",
      audience: "marketer",
      scope: "brand",
      brandId: "brand-1",
      source: "api",
      userPrompt: "List metrics",
    });

    await agentAuditStore.record({
      pipelineRunId: "run-1",
      sessionId: "session-1",
      phase: "grounding",
      componentKind: "agent",
      componentId: "grounding",
      eventType: "prompt_snapshot",
      status: "captured",
      audience: "marketer",
      scope: "brand",
      brandId: "brand-1",
      payload: {
        authorization: "Bearer should-not-persist",
        prompt: "x".repeat(5000),
      },
    });

    await agentAuditStore.finalizeRun("run-1", "completed");

    expect(currentRepo?.createAgentAuditRun).toHaveBeenCalledTimes(1);
    expect(currentRepo?.recordAgentAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineRunId: "run-1",
        payload: expect.objectContaining({
          authorization: "[REDACTED]",
          prompt: expect.objectContaining({ truncated: true }),
        }),
      })
    );
    expect(currentRepo?.finalizeAgentAuditRun).toHaveBeenCalledWith(
      "run-1",
      "completed",
      undefined
    );
  });

  it("returns safe empty data without a DB repository", async () => {
    currentRepo = null;

    await expect(
      agentAuditStore.createRun({
        pipelineRunId: "run-2",
        sessionId: "session-2",
        audience: "admin",
        scope: "global",
        source: "admin-ui",
        userPrompt: "Inspect run",
      })
    ).resolves.toBeUndefined();

    await expect(
      agentAuditStore.record({
        pipelineRunId: "run-2",
        sessionId: "session-2",
        phase: "orchestration",
        componentKind: "pipeline",
        componentId: "orchestrate-pipeline",
        eventType: "pipeline_started",
        audience: "admin",
        scope: "global",
        payload: {},
      })
    ).resolves.toBeUndefined();

    await expect(agentAuditStore.listRuns()).resolves.toEqual({ total: 0, rows: [] });
    await expect(agentAuditStore.getRun("run-2")).resolves.toBeNull();
    await expect(agentAuditStore.listEvents()).resolves.toEqual({ total: 0, rows: [] });
    await expect(agentAuditStore.cleanupExpired(7)).resolves.toBe(0);
  });
});
