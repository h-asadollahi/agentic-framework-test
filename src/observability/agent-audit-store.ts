import { logger } from "../core/logger.js";
import { getPlatformDbRepository } from "../platform/db-repository.js";
import type {
  AgentAuditEventInput,
  AgentAuditEventListOptions,
  AgentAuditEventRecord,
  AgentAuditRunInput,
  AgentAuditRunListOptions,
  AgentAuditRunRecord,
  AgentAuditRunStatus,
  AgentAuditSummaryRecord,
} from "../routing/learned-routes-db-repository.js";
import { sanitizeAuditPayload } from "./agent-audit-sanitizer.js";

let sequenceCounter = 0;

function nextSequence(): number {
  sequenceCounter = (sequenceCounter + 1) % 1000;
  return Date.now() * 1000 + sequenceCounter;
}

class AgentAuditStoreImpl {
  private initPromise: Promise<void> | null = null;

  private async getRepo() {
    const repo = getPlatformDbRepository();
    if (!repo) return null;
    if (!this.initPromise) {
      this.initPromise = repo.init().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    await this.initPromise;
    return repo;
  }

  async createRun(input: AgentAuditRunInput): Promise<void> {
    try {
      const repo = await this.getRepo();
      if (!repo) return;
      await repo.createAgentAuditRun(input);
    } catch (error) {
      logger.warn("Agent audit run creation failed", {
        pipelineRunId: input.pipelineRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async finalizeRun(
    pipelineRunId: string,
    status: AgentAuditRunStatus,
    finishedAt?: string | null
  ): Promise<void> {
    try {
      const repo = await this.getRepo();
      if (!repo) return;
      await repo.finalizeAgentAuditRun(pipelineRunId, status, finishedAt);
    } catch (error) {
      logger.warn("Agent audit run finalization failed", {
        pipelineRunId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async record(event: Omit<AgentAuditEventInput, "sequence"> & { sequence?: number }): Promise<void> {
    try {
      const repo = await this.getRepo();
      if (!repo) return;
      await repo.recordAgentAuditEvent({
        ...event,
        sequence: event.sequence ?? nextSequence(),
        payload: sanitizeAuditPayload(event.payload ?? {}) as Record<string, unknown>,
      });
    } catch (error) {
      logger.warn("Agent audit event write failed", {
        pipelineRunId: event.pipelineRunId,
        phase: event.phase,
        componentKind: event.componentKind,
        componentId: event.componentId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async listRuns(
    options: AgentAuditRunListOptions = {}
  ): Promise<{ total: number; rows: AgentAuditRunRecord[] }> {
    const repo = await this.getRepo();
    if (!repo) return { total: 0, rows: [] };
    return repo.listAgentAuditRuns(options);
  }

  async getRun(
    pipelineRunId: string
  ): Promise<AgentAuditRunRecord | null> {
    const repo = await this.getRepo();
    if (!repo) return null;
    return repo.getAgentAuditRunByPipelineRunId(pipelineRunId);
  }

  async listEvents(
    options: AgentAuditEventListOptions = {}
  ): Promise<{ total: number; rows: AgentAuditEventRecord[] }> {
    const repo = await this.getRepo();
    if (!repo) return { total: 0, rows: [] };
    return repo.listAgentAuditEvents(options);
  }

  async getSummary(options: {
    audience?: "admin" | "marketer";
    brandId?: string | null;
    days?: number;
  } = {}): Promise<AgentAuditSummaryRecord> {
    const repo = await this.getRepo();
    if (!repo) {
      return {
        totalRuns: 0,
        runningRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        rejectedRuns: 0,
        totalEvents: 0,
        totalErrors: 0,
        totalWarnings: 0,
        byPhase: [],
        byComponentKind: [],
        byStatus: [],
      };
    }
    return repo.getAgentAuditSummary(options);
  }

  async cleanupExpired(retentionDays: number): Promise<number> {
    const repo = await this.getRepo();
    if (!repo) return 0;
    const days = Math.max(1, Math.floor(retentionDays));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return repo.deleteExpiredAgentAuditEvents(cutoff);
  }
}

export const agentAuditStore = new AgentAuditStoreImpl();
