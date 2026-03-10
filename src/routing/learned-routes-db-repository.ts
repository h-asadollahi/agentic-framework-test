import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { ApiWorkflow, Endpoint, LearnedRoute } from "./learned-routes-schema.js";
import { LearnedRouteSchema } from "./learned-routes-schema.js";
import {
  learnedRouteEventsTable,
  learnedRoutesTable,
} from "./learned-routes-db-schema.js";
import { logger } from "../core/logger.js";

export interface LearnedRouteEventInput {
  routeId?: string | null;
  eventType: string;
  runId?: string | null;
  agentId?: string | null;
  details?: Record<string, unknown>;
}

export interface LearnedRouteEventRecord {
  id: number;
  routeId: string | null;
  eventType: string;
  runId: string | null;
  agentId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface LearnedRouteListOptions {
  q?: string;
  routeType?: "api" | "sub-agent";
  limit?: number;
  offset?: number;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function parseEndpoint(value: unknown): Endpoint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Endpoint;
}

function parseApiWorkflow(value: unknown): ApiWorkflow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as ApiWorkflow;
}

function toLearnedRouteRow(route: LearnedRoute) {
  return {
    id: route.id,
    capability: route.capability,
    description: route.description,
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
      CREATE TABLE IF NOT EXISTS learned_route_events (
        id SERIAL PRIMARY KEY,
        route_id TEXT,
        event_type TEXT NOT NULL,
        run_id TEXT,
        agent_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
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
      agentId: event.agentId ?? null,
      details: event.details ?? {},
    });
  }

  async listEvents(options: {
    routeId?: string;
    eventType?: string;
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
      agentId: row.agentId,
      details:
        row.details && typeof row.details === "object"
          ? (row.details as Record<string, unknown>)
          : {},
      createdAt: toIsoString(row.createdAt),
    }));
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

