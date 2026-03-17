import { and, asc, desc, eq, gte, ilike, isNotNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type {
  ApiWorkflow,
  LearnedRoute,
  RouteScope,
  RouteAudience,
  Endpoint,
} from "./learned-routes-schema.js";
import { LearnedRouteSchema } from "./learned-routes-schema.js";
import {
  brandsTable,
  learnedRouteEventsTable,
  learnedRoutesTable,
  llmPromptUsageRunsTable,
  llmUsageEventsTable,
  slackHitlThreadsTable,
} from "./learned-routes-db-schema.js";
import { logger } from "../core/logger.js";
import type { RequestAudience, RequestScope, RequestSource } from "../core/types.js";
import { BrandConfigSchema, type BrandConfig } from "../tenancy/brand-schema.js";

export interface LearnedRouteEventInput {
  routeId?: string | null;
  eventType: string;
  runId?: string | null;
  sessionId?: string | null;
  audience?: RequestAudience | null;
  scope?: RequestScope | null;
  brandId?: string | null;
  agentId?: string | null;
  details?: Record<string, unknown>;
}

export interface LearnedRouteEventRecord {
  id: number;
  routeId: string | null;
  eventType: string;
  runId: string | null;
  sessionId: string | null;
  audience: string;
  scope: string;
  brandId: string | null;
  agentId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface LearnedRouteListOptions {
  q?: string;
  audience?: RouteAudience;
  scope?: RouteScope;
  brandId?: string | null;
  routeType?: "api" | "sub-agent";
  limit?: number;
  offset?: number;
}

export interface SlackHitlThreadInput {
  kind: "escalation" | "route-learning" | "notification";
  channel: string;
  messageTs: string;
  threadTs: string;
  status?: string;
  audience?: RequestAudience;
  scope?: RequestScope;
  brandId?: string | null;
  taskDescription?: string | null;
  reason?: string | null;
  severity?: string | null;
  runId?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  routeId?: string | null;
  respondedBy?: string | null;
  responseText?: string | null;
  addedRouteId?: string | null;
  metadata?: Record<string, unknown>;
  respondedAt?: string | null;
  resolvedAt?: string | null;
}

export interface SlackHitlThreadRecord {
  id: number;
  kind: string;
  channel: string;
  messageTs: string;
  threadTs: string;
  status: string;
  audience: string;
  scope: string;
  brandId: string | null;
  taskDescription: string | null;
  reason: string | null;
  severity: string | null;
  runId: string | null;
  sessionId: string | null;
  agentId: string | null;
  routeId: string | null;
  respondedBy: string | null;
  responseText: string | null;
  addedRouteId: string | null;
  metadata: Record<string, unknown>;
  respondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlackHitlSummaryRecord {
  total: number;
  responded: number;
  pending: number;
  routeAdded: number;
  approved: number;
  rejected: number;
  timedOut: number;
  escalations: number;
  routeLearning: number;
  notifications: number;
}

export interface LlmUsageEventInput {
  pipelineRunId?: string | null;
  audience: RequestAudience;
  scope: RequestScope;
  brandId?: string | null;
  source: RequestSource;
  sessionId: string;
  runId: string;
  componentKind: "agent" | "sub-agent";
  componentId: string;
  modelAlias: string;
  resolvedModelId: string;
  provider: string;
  tokensUsed: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdAt?: string | null;
}

export interface LlmPromptUsageRunInput {
  pipelineRunId: string;
  audience: RequestAudience;
  scope: RequestScope;
  brandId?: string | null;
  source: RequestSource;
  sessionId: string;
  userPrompt: string;
  startedAt?: string | null;
}

export type LlmPromptUsageRunStatus = "running" | "completed" | "failed" | "rejected";

export interface LlmPromptUsageRunRecord {
  id: number;
  pipelineRunId: string;
  audience: string;
  scope: string;
  brandId: string | null;
  source: string;
  sessionId: string;
  userPrompt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  llmCallCount: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlmUsageSummaryRecord {
  totalPrompts: number;
  totalLlmCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCalls: number;
  byProvider: Array<{ provider: string; tokens: number; calls: number }>;
  byModel: Array<{ model: string; tokens: number; calls: number }>;
  daily: Array<{
    bucket: string;
    promptCount: number;
    llmCallCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokens: number;
    calls: number;
  }>;
}

export interface LlmPromptUsageListOptions {
  audience?: RequestAudience;
  brandId?: string | null;
  days?: number;
  limit?: number;
  offset?: number;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseEndpoint(value: unknown): Endpoint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Endpoint;
}

function parseApiWorkflow(value: unknown): ApiWorkflow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as ApiWorkflow;
}

function fromLlmPromptUsageRunRow(
  row: typeof llmPromptUsageRunsTable.$inferSelect
): LlmPromptUsageRunRecord {
  return {
    id: row.id,
    pipelineRunId: row.pipelineRunId,
    audience: row.audience,
    scope: row.scope,
    brandId: normalizeNullableString(row.brandId),
    source: row.source,
    sessionId: row.sessionId,
    userPrompt: row.userPrompt,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    totalTokens: row.totalTokens ?? 0,
    llmCallCount: row.llmCallCount ?? 0,
    status: row.status,
    startedAt: toIsoString(row.startedAt),
    finishedAt: row.finishedAt ? toIsoString(row.finishedAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toLearnedRouteRow(route: LearnedRoute) {
  return {
    id: route.id,
    capability: route.capability,
    description: route.description,
    audience: route.audience,
    scope: route.scope,
    brandId: normalizeNullableString(route.brandId),
    matchPatterns: route.matchPatterns,
    routeType: route.routeType,
    endpoint: route.endpoint ?? null,
    apiWorkflow: route.apiWorkflow ?? null,
    agentId: route.agentId ?? null,
    agentInputDefaults: route.agentInputDefaults ?? {},
    inputMapping: route.inputMapping ?? {},
    outputFormat: route.outputFormat,
    addedAt: new Date(route.addedAt),
    addedBy: route.addedBy,
    usageCount: route.usageCount,
    lastUsedAt: route.lastUsedAt ? new Date(route.lastUsedAt) : null,
    updatedAt: new Date(),
  };
}

function fromLearnedRouteRow(
  row: typeof learnedRoutesTable.$inferSelect
): LearnedRoute {
  return LearnedRouteSchema.parse({
    id: row.id,
    capability: row.capability,
    description: row.description,
    audience: row.audience,
    scope: row.scope,
    brandId: normalizeNullableString(row.brandId),
    matchPatterns: Array.isArray(row.matchPatterns) ? row.matchPatterns : [],
    routeType: row.routeType,
    endpoint: parseEndpoint(row.endpoint),
    apiWorkflow: parseApiWorkflow(row.apiWorkflow),
    agentId: row.agentId ?? undefined,
    agentInputDefaults:
      row.agentInputDefaults && typeof row.agentInputDefaults === "object"
        ? (row.agentInputDefaults as Record<string, unknown>)
        : {},
    inputMapping:
      row.inputMapping && typeof row.inputMapping === "object"
        ? (row.inputMapping as Record<string, string>)
        : {},
    outputFormat: row.outputFormat,
    addedAt: toIsoString(row.addedAt),
    addedBy: row.addedBy,
    usageCount: row.usageCount ?? 0,
    lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
  });
}

function toNullableTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function fromSlackHitlThreadRow(
  row: typeof slackHitlThreadsTable.$inferSelect
): SlackHitlThreadRecord {
  return {
    id: row.id,
    kind: row.kind,
    channel: row.channel,
    messageTs: row.messageTs,
    threadTs: row.threadTs,
    status: row.status,
    audience: row.audience,
    scope: row.scope,
    brandId: normalizeNullableString(row.brandId),
    taskDescription: row.taskDescription ?? null,
    reason: row.reason ?? null,
    severity: row.severity ?? null,
    runId: row.runId ?? null,
    sessionId: row.sessionId ?? null,
    agentId: row.agentId ?? null,
    routeId: row.routeId ?? null,
    respondedBy: row.respondedBy ?? null,
    responseText: row.responseText ?? null,
    addedRouteId: row.addedRouteId ?? null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    respondedAt: row.respondedAt ? toIsoString(row.respondedAt) : null,
    resolvedAt: row.resolvedAt ? toIsoString(row.resolvedAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function fromBrandRow(row: typeof brandsTable.$inferSelect): BrandConfig {
  return BrandConfigSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    brandIdentity:
      row.brandIdentity && typeof row.brandIdentity === "object"
        ? row.brandIdentity
        : {},
    guardrails:
      row.guardrails && typeof row.guardrails === "object" ? row.guardrails : {},
    channelRules:
      row.channelRules && typeof row.channelRules === "object"
        ? row.channelRules
        : {},
    isActive: row.isActive,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  });
}

export class LearnedRoutesDbRepository {
  private readonly pool: Pool;
  private readonly db: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool);
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS learned_routes (
        id TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        description TEXT NOT NULL,
        audience TEXT NOT NULL DEFAULT 'marketer',
        scope TEXT NOT NULL DEFAULT 'global',
        brand_id TEXT,
        match_patterns JSONB NOT NULL,
        route_type TEXT NOT NULL,
        endpoint JSONB,
        api_workflow JSONB,
        agent_id TEXT,
        agent_input_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
        input_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
        output_format TEXT NOT NULL,
        added_at TIMESTAMPTZ NOT NULL,
        added_by TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE learned_routes
        ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'marketer',
        ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global',
        ADD COLUMN IF NOT EXISTS brand_id TEXT;
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS learned_route_events (
        id SERIAL PRIMARY KEY,
        route_id TEXT,
        event_type TEXT NOT NULL,
        run_id TEXT,
        session_id TEXT,
        audience TEXT NOT NULL DEFAULT 'marketer',
        scope TEXT NOT NULL DEFAULT 'global',
        brand_id TEXT,
        agent_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE learned_route_events
        ADD COLUMN IF NOT EXISTS session_id TEXT,
        ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'marketer',
        ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global',
        ADD COLUMN IF NOT EXISTS brand_id TEXT;
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS slack_hitl_threads (
        id SERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        channel TEXT NOT NULL,
        message_ts TEXT NOT NULL,
        thread_ts TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'sent',
        audience TEXT NOT NULL DEFAULT 'admin',
        scope TEXT NOT NULL DEFAULT 'global',
        brand_id TEXT,
        task_description TEXT,
        reason TEXT,
        severity TEXT,
        run_id TEXT,
        session_id TEXT,
        agent_id TEXT,
        route_id TEXT,
        responded_by TEXT,
        response_text TEXT,
        added_route_id TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        responded_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE slack_hitl_threads
        ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'admin',
        ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global',
        ADD COLUMN IF NOT EXISTS brand_id TEXT,
        ADD COLUMN IF NOT EXISTS session_id TEXT;
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS slack_hitl_threads_channel_created_at_idx
      ON slack_hitl_threads (channel, created_at DESC);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS slack_hitl_threads_kind_created_at_idx
      ON slack_hitl_threads (kind, created_at DESC);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        brand_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
        guardrails JSONB NOT NULL DEFAULT '{}'::jsonb,
        channel_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS brands_name_key ON brands (name);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS llm_usage_events (
        id SERIAL PRIMARY KEY,
        pipeline_run_id TEXT,
        audience TEXT NOT NULL,
        scope TEXT NOT NULL,
        brand_id TEXT,
        source TEXT NOT NULL,
        session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        component_kind TEXT NOT NULL,
        component_id TEXT NOT NULL,
        model_alias TEXT NOT NULL,
        resolved_model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE llm_usage_events
        ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT,
        ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
        ADD COLUMN IF NOT EXISTS completion_tokens INTEGER;
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS llm_usage_events_audience_created_at_idx
      ON llm_usage_events (audience, created_at DESC);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS llm_usage_events_brand_created_at_idx
      ON llm_usage_events (brand_id, created_at DESC);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS llm_usage_events_run_id_idx
      ON llm_usage_events (run_id);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS llm_usage_events_pipeline_run_id_idx
      ON llm_usage_events (pipeline_run_id);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS llm_prompt_usage_runs (
        id SERIAL PRIMARY KEY,
        pipeline_run_id TEXT NOT NULL,
        audience TEXT NOT NULL,
        scope TEXT NOT NULL,
        brand_id TEXT,
        source TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_prompt TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        llm_call_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS llm_prompt_usage_runs_pipeline_run_id_key
      ON llm_prompt_usage_runs (pipeline_run_id);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS llm_prompt_usage_runs_audience_started_at_idx
      ON llm_prompt_usage_runs (audience, started_at DESC);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS llm_prompt_usage_runs_brand_started_at_idx
      ON llm_prompt_usage_runs (brand_id, started_at DESC);
    `);
  }

  async listRoutes(options: LearnedRouteListOptions = {}): Promise<LearnedRoute[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const trimmedQuery = options.q?.trim();

    const conditions = [];
    if (options.routeType) {
      conditions.push(eq(learnedRoutesTable.routeType, options.routeType));
    }
    if (options.audience) {
      conditions.push(eq(learnedRoutesTable.audience, options.audience));
    }
    if (options.scope) {
      conditions.push(eq(learnedRoutesTable.scope, options.scope));
    }
    if (options.brandId) {
      conditions.push(eq(learnedRoutesTable.brandId, options.brandId));
    }
    if (trimmedQuery) {
      conditions.push(
        or(
          ilike(learnedRoutesTable.capability, `%${trimmedQuery}%`),
          ilike(learnedRoutesTable.description, `%${trimmedQuery}%`)
        )
      );
    }

    const rows = await this.db
      .select()
      .from(learnedRoutesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(learnedRoutesTable.usageCount), desc(learnedRoutesTable.updatedAt))
      .limit(limit)
      .offset(offset);

    return rows.map(fromLearnedRouteRow);
  }

  async getRouteById(routeId: string): Promise<LearnedRoute | null> {
    const rows = await this.db
      .select()
      .from(learnedRoutesTable)
      .where(eq(learnedRoutesTable.id, routeId))
      .limit(1);
    if (rows.length === 0) return null;
    return fromLearnedRouteRow(rows[0]);
  }

  async upsertRoute(route: LearnedRoute): Promise<void> {
    const row = toLearnedRouteRow(route);

    await this.db
      .insert(learnedRoutesTable)
      .values(row)
      .onConflictDoUpdate({
        target: learnedRoutesTable.id,
        set: {
          capability: row.capability,
          description: row.description,
          audience: row.audience,
          scope: row.scope,
          brandId: row.brandId,
          matchPatterns: row.matchPatterns,
          routeType: row.routeType,
          endpoint: row.endpoint,
          apiWorkflow: row.apiWorkflow,
          agentId: row.agentId,
          agentInputDefaults: row.agentInputDefaults,
          inputMapping: row.inputMapping,
          outputFormat: row.outputFormat,
          addedAt: row.addedAt,
          addedBy: row.addedBy,
          usageCount: row.usageCount,
          lastUsedAt: row.lastUsedAt,
          updatedAt: new Date(),
        },
      });
  }

  async deleteRoute(routeId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(learnedRoutesTable)
      .where(eq(learnedRoutesTable.id, routeId))
      .returning({ id: learnedRoutesTable.id });
    return deleted.length > 0;
  }

  async incrementUsage(routeId: string): Promise<LearnedRoute | null> {
    const now = new Date();
    const rows = await this.db
      .update(learnedRoutesTable)
      .set({
        usageCount: sql`${learnedRoutesTable.usageCount} + 1`,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(learnedRoutesTable.id, routeId))
      .returning();

    if (rows.length === 0) return null;
    return fromLearnedRouteRow(rows[0]);
  }

  async countRoutes(): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(learnedRoutesTable);
    return rows[0]?.value ?? 0;
  }

  async recordEvent(event: LearnedRouteEventInput): Promise<void> {
    await this.db.insert(learnedRouteEventsTable).values({
      routeId: event.routeId ?? null,
      eventType: event.eventType,
      runId: event.runId ?? null,
      sessionId: event.sessionId ?? null,
      audience: event.audience ?? "marketer",
      scope: event.scope ?? "global",
      brandId: normalizeNullableString(event.brandId),
      agentId: event.agentId ?? null,
      details: event.details ?? {},
    });
  }

  async listEvents(options: {
    routeId?: string;
    eventType?: string;
    audience?: RequestAudience;
    brandId?: string | null;
    limit?: number;
    offset?: number;
  } = {}): Promise<LearnedRouteEventRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);
    const conditions = [];
    if (options.routeId) {
      conditions.push(eq(learnedRouteEventsTable.routeId, options.routeId));
    }
    if (options.eventType) {
      conditions.push(eq(learnedRouteEventsTable.eventType, options.eventType));
    }
    if (options.audience) {
      conditions.push(eq(learnedRouteEventsTable.audience, options.audience));
    }
    if (options.brandId) {
      conditions.push(eq(learnedRouteEventsTable.brandId, options.brandId));
    }

    const rows = await this.db
      .select()
      .from(learnedRouteEventsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(learnedRouteEventsTable.createdAt), desc(learnedRouteEventsTable.id))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      routeId: row.routeId,
      eventType: row.eventType,
      runId: row.runId,
      sessionId: row.sessionId,
      audience: row.audience,
      scope: row.scope,
      brandId: normalizeNullableString(row.brandId),
      agentId: row.agentId,
      details:
        row.details && typeof row.details === "object"
          ? (row.details as Record<string, unknown>)
          : {},
      createdAt: toIsoString(row.createdAt),
    }));
  }

  async upsertSlackHitlThread(
    thread: SlackHitlThreadInput
  ): Promise<SlackHitlThreadRecord> {
    const now = new Date();
    const rows = await this.db
      .insert(slackHitlThreadsTable)
      .values({
        kind: thread.kind,
        channel: thread.channel,
        messageTs: thread.messageTs,
        threadTs: thread.threadTs,
        status: thread.status ?? "sent",
        audience: thread.audience ?? "admin",
        scope: thread.scope ?? "global",
        brandId: normalizeNullableString(thread.brandId),
        taskDescription: thread.taskDescription ?? null,
        reason: thread.reason ?? null,
        severity: thread.severity ?? null,
        runId: thread.runId ?? null,
        sessionId: thread.sessionId ?? null,
        agentId: thread.agentId ?? null,
        routeId: thread.routeId ?? null,
        respondedBy: thread.respondedBy ?? null,
        responseText: thread.responseText ?? null,
        addedRouteId: thread.addedRouteId ?? null,
        metadata: thread.metadata ?? {},
        respondedAt: toNullableTimestamp(thread.respondedAt),
        resolvedAt: toNullableTimestamp(thread.resolvedAt),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: slackHitlThreadsTable.threadTs,
        set: {
          kind: thread.kind,
          channel: thread.channel,
          messageTs: thread.messageTs,
          status: thread.status ?? "sent",
          audience: thread.audience ?? "admin",
          scope: thread.scope ?? "global",
          brandId: normalizeNullableString(thread.brandId),
          taskDescription: thread.taskDescription ?? null,
          reason: thread.reason ?? null,
          severity: thread.severity ?? null,
          runId: thread.runId ?? null,
          sessionId: thread.sessionId ?? null,
          agentId: thread.agentId ?? null,
          routeId: thread.routeId ?? null,
          respondedBy: thread.respondedBy ?? null,
          responseText: thread.responseText ?? null,
          addedRouteId: thread.addedRouteId ?? null,
          metadata: thread.metadata ?? {},
          respondedAt: toNullableTimestamp(thread.respondedAt),
          resolvedAt: toNullableTimestamp(thread.resolvedAt),
          updatedAt: now,
        },
      })
      .returning();

    return fromSlackHitlThreadRow(rows[0]);
  }

  async getSlackHitlThreadByThreadTs(
    threadTs: string
  ): Promise<SlackHitlThreadRecord | null> {
    const rows = await this.db
      .select()
      .from(slackHitlThreadsTable)
      .where(eq(slackHitlThreadsTable.threadTs, threadTs))
      .limit(1);

    if (rows.length === 0) return null;
    return fromSlackHitlThreadRow(rows[0]);
  }

  async listSlackHitlThreads(options: {
    channel?: string;
    kind?: "escalation" | "route-learning" | "notification";
    status?: string;
    audience?: RequestAudience;
    brandId?: string | null;
    limit?: number;
    offset?: number;
  } = {}): Promise<SlackHitlThreadRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const conditions = [];

    if (options.channel) {
      conditions.push(eq(slackHitlThreadsTable.channel, options.channel));
    }
    if (options.kind) {
      conditions.push(eq(slackHitlThreadsTable.kind, options.kind));
    }
    if (options.status) {
      conditions.push(eq(slackHitlThreadsTable.status, options.status));
    }
    if (options.audience) {
      conditions.push(eq(slackHitlThreadsTable.audience, options.audience));
    }
    if (options.brandId) {
      conditions.push(eq(slackHitlThreadsTable.brandId, options.brandId));
    }

    const rows = await this.db
      .select()
      .from(slackHitlThreadsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(slackHitlThreadsTable.createdAt), desc(slackHitlThreadsTable.id))
      .limit(limit)
      .offset(offset);

    return rows.map(fromSlackHitlThreadRow);
  }

  async getSlackHitlSummary(options: {
    channel?: string;
    kind?: "escalation" | "route-learning" | "notification";
    audience?: RequestAudience;
    brandId?: string | null;
  } = {}): Promise<SlackHitlSummaryRecord> {
    const conditions = [];

    if (options.channel) {
      conditions.push(eq(slackHitlThreadsTable.channel, options.channel));
    }
    if (options.kind) {
      conditions.push(eq(slackHitlThreadsTable.kind, options.kind));
    }
    if (options.audience) {
      conditions.push(eq(slackHitlThreadsTable.audience, options.audience));
    }
    if (options.brandId) {
      conditions.push(eq(slackHitlThreadsTable.brandId, options.brandId));
    }

    const rows = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        responded:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.respondedAt} is not null)::int`,
        pending:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.kind} != 'notification' and ${slackHitlThreadsTable.status} in ('sent', 'responded'))::int`,
        routeAdded:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.addedRouteId} is not null)::int`,
        approved:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.status} = 'approved')::int`,
        rejected:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.status} = 'rejected')::int`,
        timedOut:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.status} = 'timed_out')::int`,
        escalations:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.kind} = 'escalation')::int`,
        routeLearning:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.kind} = 'route-learning')::int`,
        notifications:
          sql<number>`count(*) filter (where ${slackHitlThreadsTable.kind} = 'notification')::int`,
      })
      .from(slackHitlThreadsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      total: rows[0]?.total ?? 0,
      responded: rows[0]?.responded ?? 0,
      pending: rows[0]?.pending ?? 0,
      routeAdded: rows[0]?.routeAdded ?? 0,
      approved: rows[0]?.approved ?? 0,
      rejected: rows[0]?.rejected ?? 0,
      timedOut: rows[0]?.timedOut ?? 0,
      escalations: rows[0]?.escalations ?? 0,
      routeLearning: rows[0]?.routeLearning ?? 0,
      notifications: rows[0]?.notifications ?? 0,
    };
  }

  async countBrands(): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(brandsTable);
    return rows[0]?.value ?? 0;
  }

  async listBrands(): Promise<BrandConfig[]> {
    const rows = await this.db
      .select()
      .from(brandsTable)
      .where(eq(brandsTable.isActive, true))
      .orderBy(asc(brandsTable.name));

    return rows.map(fromBrandRow);
  }

  async getBrandById(brandId: string): Promise<BrandConfig | null> {
    const rows = await this.db
      .select()
      .from(brandsTable)
      .where(eq(brandsTable.id, brandId))
      .limit(1);

    if (rows.length === 0) return null;
    return fromBrandRow(rows[0]);
  }

  async upsertBrand(brand: BrandConfig): Promise<BrandConfig> {
    const now = new Date();
    const rows = await this.db
      .insert(brandsTable)
      .values({
        id: brand.id,
        name: brand.name,
        description: brand.description ?? "",
        brandIdentity: brand.brandIdentity as Record<string, unknown>,
        guardrails: brand.guardrails as Record<string, unknown>,
        channelRules: brand.channelRules ?? {},
        isActive: brand.isActive,
        createdAt: new Date(brand.createdAt),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: brandsTable.id,
        set: {
          name: brand.name,
          description: brand.description ?? "",
          brandIdentity: brand.brandIdentity as Record<string, unknown>,
          guardrails: brand.guardrails as Record<string, unknown>,
          channelRules: brand.channelRules ?? {},
          isActive: brand.isActive,
          updatedAt: now,
        },
      })
      .returning();

    return fromBrandRow(rows[0]);
  }

  async recordLlmUsageEvent(event: LlmUsageEventInput): Promise<void> {
    await this.db.insert(llmUsageEventsTable).values({
      pipelineRunId: normalizeNullableString(event.pipelineRunId),
      audience: event.audience,
      scope: event.scope,
      brandId: normalizeNullableString(event.brandId),
      source: event.source,
      sessionId: event.sessionId,
      runId: event.runId,
      componentKind: event.componentKind,
      componentId: event.componentId,
      modelAlias: event.modelAlias,
      resolvedModelId: event.resolvedModelId,
      provider: event.provider,
      tokensUsed: Math.max(0, Math.floor(event.tokensUsed || 0)),
      promptTokens:
        typeof event.promptTokens === "number"
          ? Math.max(0, Math.floor(event.promptTokens))
          : null,
      completionTokens:
        typeof event.completionTokens === "number"
          ? Math.max(0, Math.floor(event.completionTokens))
          : null,
      createdAt: event.createdAt ? new Date(event.createdAt) : new Date(),
    });

    const pipelineRunId = normalizeNullableString(event.pipelineRunId);
    if (!pipelineRunId) return;

    const promptTokens =
      typeof event.promptTokens === "number"
        ? Math.max(0, Math.floor(event.promptTokens))
        : 0;
    const completionTokens =
      typeof event.completionTokens === "number"
        ? Math.max(0, Math.floor(event.completionTokens))
        : 0;
    const totalTokens = Math.max(0, Math.floor(event.tokensUsed || 0));

    await this.db
      .update(llmPromptUsageRunsTable)
      .set({
        inputTokens: sql`${llmPromptUsageRunsTable.inputTokens} + ${promptTokens}`,
        outputTokens: sql`${llmPromptUsageRunsTable.outputTokens} + ${completionTokens}`,
        totalTokens: sql`${llmPromptUsageRunsTable.totalTokens} + ${totalTokens}`,
        llmCallCount: sql`${llmPromptUsageRunsTable.llmCallCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(llmPromptUsageRunsTable.pipelineRunId, pipelineRunId));
  }

  async createLlmPromptUsageRun(
    input: LlmPromptUsageRunInput
  ): Promise<void> {
    await this.db
      .insert(llmPromptUsageRunsTable)
      .values({
        pipelineRunId: input.pipelineRunId,
        audience: input.audience,
        scope: input.scope,
        brandId: normalizeNullableString(input.brandId),
        source: input.source,
        sessionId: input.sessionId,
        userPrompt: input.userPrompt,
        status: "running",
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: llmPromptUsageRunsTable.pipelineRunId,
      });
  }

  async finalizeLlmPromptUsageRun(
    pipelineRunId: string,
    status: LlmPromptUsageRunStatus,
    finishedAt?: string | null
  ): Promise<void> {
    await this.db
      .update(llmPromptUsageRunsTable)
      .set({
        status,
        finishedAt: finishedAt ? new Date(finishedAt) : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(llmPromptUsageRunsTable.pipelineRunId, pipelineRunId));
  }

  async getLlmUsageSummary(options: {
    audience?: RequestAudience;
    brandId?: string | null;
    days?: number;
  } = {}): Promise<LlmUsageSummaryRecord> {
    const days = Math.min(Math.max(options.days ?? 7, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const promptConditions = [];
    const eventConditions = [];

    promptConditions.push(gte(llmPromptUsageRunsTable.startedAt, since));
    eventConditions.push(gte(llmUsageEventsTable.createdAt, since));
    eventConditions.push(isNotNull(llmUsageEventsTable.pipelineRunId));
    if (options.audience) {
      promptConditions.push(eq(llmPromptUsageRunsTable.audience, options.audience));
      eventConditions.push(eq(llmUsageEventsTable.audience, options.audience));
    }
    if (options.brandId) {
      promptConditions.push(eq(llmPromptUsageRunsTable.brandId, options.brandId));
      eventConditions.push(eq(llmUsageEventsTable.brandId, options.brandId));
    }

    const promptWhereClause =
      promptConditions.length > 0 ? and(...promptConditions) : undefined;
    const eventWhereClause =
      eventConditions.length > 0 ? and(...eventConditions) : undefined;
    const promptDailyBucket =
      sql<string>`to_char(date_trunc('day', ${llmPromptUsageRunsTable.startedAt}), 'YYYY-MM-DD')`;

    const [totalsRows, providerRows, modelRows, dailyRows] = await Promise.all([
      this.db
        .select({
          totalPrompts: sql<number>`count(*)::int`,
          totalLlmCalls: sql<number>`coalesce(sum(${llmPromptUsageRunsTable.llmCallCount}), 0)::int`,
          totalInputTokens:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.inputTokens}), 0)::int`,
          totalOutputTokens:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.outputTokens}), 0)::int`,
          totalTokens:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.totalTokens}), 0)::int`,
        })
        .from(llmPromptUsageRunsTable)
        .where(promptWhereClause),
      this.db
        .select({
          provider: llmUsageEventsTable.provider,
          tokens: sql<number>`coalesce(sum(${llmUsageEventsTable.tokensUsed}), 0)::int`,
          calls: sql<number>`count(*)::int`,
        })
        .from(llmUsageEventsTable)
        .where(eventWhereClause)
        .groupBy(llmUsageEventsTable.provider)
        .orderBy(desc(sql`coalesce(sum(${llmUsageEventsTable.tokensUsed}), 0)`)),
      this.db
        .select({
          model: llmUsageEventsTable.resolvedModelId,
          tokens: sql<number>`coalesce(sum(${llmUsageEventsTable.tokensUsed}), 0)::int`,
          calls: sql<number>`count(*)::int`,
        })
        .from(llmUsageEventsTable)
        .where(eventWhereClause)
        .groupBy(llmUsageEventsTable.resolvedModelId)
        .orderBy(desc(sql`coalesce(sum(${llmUsageEventsTable.tokensUsed}), 0)`)),
      this.db
        .select({
          bucket: promptDailyBucket,
          promptCount: sql<number>`count(*)::int`,
          llmCallCount:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.llmCallCount}), 0)::int`,
          inputTokens:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.inputTokens}), 0)::int`,
          outputTokens:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.outputTokens}), 0)::int`,
          totalTokens:
            sql<number>`coalesce(sum(${llmPromptUsageRunsTable.totalTokens}), 0)::int`,
        })
        .from(llmPromptUsageRunsTable)
        .where(promptWhereClause)
        .groupBy(promptDailyBucket)
        .orderBy(asc(promptDailyBucket)),
    ]);

    return {
      totalPrompts: totalsRows[0]?.totalPrompts ?? 0,
      totalLlmCalls: totalsRows[0]?.totalLlmCalls ?? 0,
      totalInputTokens: totalsRows[0]?.totalInputTokens ?? 0,
      totalOutputTokens: totalsRows[0]?.totalOutputTokens ?? 0,
      totalTokens: totalsRows[0]?.totalTokens ?? 0,
      totalCalls: totalsRows[0]?.totalLlmCalls ?? 0,
      byProvider: providerRows.map((row) => ({
        provider: row.provider,
        tokens: row.tokens ?? 0,
        calls: row.calls ?? 0,
      })),
      byModel: modelRows.map((row) => ({
        model: row.model,
        tokens: row.tokens ?? 0,
        calls: row.calls ?? 0,
      })),
      daily: dailyRows.map((row) => ({
        bucket: row.bucket,
        promptCount: row.promptCount ?? 0,
        llmCallCount: row.llmCallCount ?? 0,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        totalTokens: row.totalTokens ?? 0,
        tokens: row.totalTokens ?? 0,
        calls: row.llmCallCount ?? 0,
      })),
    };
  }

  async listLlmPromptUsageRuns(
    options: LlmPromptUsageListOptions = {}
  ): Promise<{ total: number; rows: LlmPromptUsageRunRecord[] }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const days = Math.min(Math.max(options.days ?? 7, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const conditions = [gte(llmPromptUsageRunsTable.startedAt, since)];

    if (options.audience) {
      conditions.push(eq(llmPromptUsageRunsTable.audience, options.audience));
    }
    if (options.brandId) {
      conditions.push(eq(llmPromptUsageRunsTable.brandId, options.brandId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRows, rows] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(llmPromptUsageRunsTable)
        .where(whereClause),
      this.db
        .select()
        .from(llmPromptUsageRunsTable)
        .where(whereClause)
        .orderBy(desc(llmPromptUsageRunsTable.startedAt))
        .limit(limit)
        .offset(offset),
    ]);

    return {
      total: countRows[0]?.total ?? 0,
      rows: rows.map(fromLlmPromptUsageRunRow),
    };
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
    } catch (error) {
      logger.warn("Failed to close learned-routes DB pool", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
