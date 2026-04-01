import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  LearnedRoutesFileSchema,
  type LearnedRoute,
  type LearnedRoutesFile,
  type ApiWorkflow,
  type Endpoint,
  type RouteAudience,
  type RouteScope,
} from "./learned-routes-schema.js";
import {
  LearnedRoutesDbRepository,
  type LearnedRouteEventRecord,
  type SlackHitlSummaryRecord,
  type SlackHitlThreadInput,
  type SlackHitlThreadRecord,
} from "./learned-routes-db-repository.js";
import { logger } from "../core/logger.js";
import { getPlatformDbRepository } from "../platform/db-repository.js";
import type { RequestContext } from "../core/types.js";
import { allowsAudience } from "../core/request-context.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    const hasPackageJson = existsSync(join(current, "package.json"));
    const hasKnowledgeDir = existsSync(join(current, "knowledge"));

    if (hasPackageJson && hasKnowledgeDir) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

const PROJECT_ROOT =
  findProjectRoot(process.cwd()) ??
  findProjectRoot(__dirname) ??
  resolve(__dirname, "../..");

const ROUTES_FILE = resolve(PROJECT_ROOT, "knowledge/learned-routes.json");

function isTrue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

type RouteSummary = {
  id: string;
  capability: string;
  description: string;
  audience: RouteAudience;
  scope: RouteScope;
  brandId: string | null;
  matchPatterns: string[];
  routeType: "api" | "sub-agent";
  agentId?: string;
  endpointUrl?: string;
  workflowType?: NonNullable<ApiWorkflow>["workflowType"];
};

class LearnedRoutesStoreImpl {
  private routes: LearnedRoute[] = [];
  private loaded = false;
  private dbRepository: LearnedRoutesDbRepository | null = null;
  private dbEnabled = false;

  private dualWriteJsonEnabled(): boolean {
    return isTrue(process.env.LEARNED_ROUTES_DUAL_WRITE_JSON);
  }

  private resolveDbRepository(): LearnedRoutesDbRepository | null {
    if (this.dbRepository) return this.dbRepository;
    this.dbRepository = getPlatformDbRepository();
    return this.dbRepository;
  }

  private loadFromJsonSync(): void {
    if (!existsSync(ROUTES_FILE)) {
      logger.info("No learned-routes.json found, starting with empty routes");
      this.routes = [];
      this.loaded = true;
      this.dbEnabled = false;
      return;
    }

    try {
      const raw = readFileSync(ROUTES_FILE, "utf-8");
      if (raw.trim().length === 0) {
        logger.warn("learned-routes.json is empty, treating fallback catalog as empty");
        this.routes = [];
        this.loaded = true;
        this.dbEnabled = false;
        return;
      }
      const parsed = JSON.parse(raw);
      const validated = LearnedRoutesFileSchema.parse(parsed);
      this.routes = validated.routes;
      this.loaded = true;
      this.dbEnabled = false;
      logger.info(`Loaded ${this.routes.length} learned route(s) from disk`);
    } catch (error) {
      logger.error("Failed to load learned-routes.json", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.routes = [];
      this.loaded = true;
      this.dbEnabled = false;
    }
  }

  private saveJson(): void {
    const file: LearnedRoutesFile = {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      routes: this.routes,
    };

    try {
      mkdirSync(dirname(ROUTES_FILE), { recursive: true });
      writeFileSync(ROUTES_FILE, JSON.stringify(file, null, 2) + "\n", "utf-8");
      logger.info(`Saved ${this.routes.length} learned route(s) to disk`);
    } catch (error) {
      logger.error("Failed to save learned-routes.json", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async load(): Promise<void> {
    const repo = this.resolveDbRepository();

    if (!repo) {
      this.loadFromJsonSync();
      return;
    }

    try {
      await repo.init();
      this.routes = await repo.listRoutes({ limit: 1000, offset: 0 });
      this.loaded = true;
      this.dbEnabled = true;
      logger.info(`Loaded ${this.routes.length} learned route(s) from DB`);

      if (this.dualWriteJsonEnabled()) {
        this.saveJson();
      }
    } catch (error) {
      logger.error("Failed to load learned routes from DB, falling back to JSON", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.loadFromJsonSync();
    }
  }

  private ensureLoaded(): void {
    if (this.loaded) return;

    if (process.env.DATABASE_URL?.trim()) {
      throw new Error(
        "learnedRoutesStore.load() must be awaited before using DB-backed routes"
      );
    }

    this.loadFromJsonSync();
  }

  private nextRouteId(): string {
    let max = 0;

    for (const route of this.routes) {
      const match = route.id.match(/^route-(\d+)$/i);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) max = value;
    }

    return `route-${String(max + 1).padStart(3, "0")}`;
  }

  private async persistRoute(route: LearnedRoute, eventType: string): Promise<void> {
    const repo = this.dbEnabled ? this.resolveDbRepository() : null;

    if (repo) {
      await repo.upsertRoute(route);
      await repo.recordEvent({
        routeId: route.id,
        eventType,
        details: {
          routeType: route.routeType,
          capability: route.capability,
        },
      });
    }

    if (!repo || this.dualWriteJsonEnabled()) {
      this.saveJson();
    }
  }

  findByCapability(
    description: string,
    requestContext?: RequestContext
  ): LearnedRoute | null {
    this.ensureLoaded();

    const lower = description.toLowerCase();
    let bestMatch: LearnedRoute | null = null;
    let bestScore = 0;

    for (const route of this.routes.filter((item) =>
      routeMatchesRequestContext(item, requestContext)
    )) {
      let score = 0;
      for (const pattern of route.matchPatterns) {
        if (lower.includes(pattern.toLowerCase())) {
          score += pattern.length;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = route;
      } else if (
        score > 0 &&
        score === bestScore &&
        bestMatch &&
        compareRoutePriority(route, bestMatch) > 0
      ) {
        bestMatch = route;
      }
    }

    if (bestMatch) {
      logger.info(`Matched learned route "${bestMatch.id}" (score: ${bestScore})`, {
        capability: bestMatch.capability,
        description: description.slice(0, 80),
      });

      const repo = this.dbEnabled ? this.resolveDbRepository() : null;
      if (repo) {
        void repo.recordEvent({
          routeId: bestMatch.id,
          eventType: "route_matched",
          details: {
            descriptionPreview: description.slice(0, 200),
            matchScore: bestScore,
          },
        });
      }
    }

    return bestMatch;
  }

  getById(routeId: string): LearnedRoute | null {
    this.ensureLoaded();
    return this.routes.find((r) => r.id === routeId) ?? null;
  }

  async addRoute(data: {
    capability: string;
    description: string;
    matchPatterns: string[];
    audience?: RouteAudience;
    scope?: RouteScope;
    brandId?: string | null;
    routeType?: "api" | "sub-agent";
    endpoint?: Endpoint;
    apiWorkflow?: ApiWorkflow;
    agentId?: string;
    agentInputDefaults?: Record<string, unknown>;
    inputMapping?: Record<string, string>;
    outputFormat?: "json" | "text" | "csv";
    addedBy: string;
  }): Promise<LearnedRoute> {
    this.ensureLoaded();

    const id = this.nextRouteId();

    const newRoute: LearnedRoute = {
      id,
      capability: data.capability,
      description: data.description,
      audience: data.audience ?? "marketer",
      scope: data.scope ?? "global",
      brandId: data.brandId ?? null,
      matchPatterns: data.matchPatterns,
      routeType: data.routeType ?? "api",
      endpoint: data.endpoint,
      apiWorkflow: data.apiWorkflow,
      agentId: data.agentId,
      agentInputDefaults: data.agentInputDefaults ?? {},
      inputMapping: data.inputMapping ?? {},
      outputFormat: data.outputFormat ?? "json",
      addedAt: new Date().toISOString(),
      addedBy: data.addedBy,
      usageCount: 0,
      lastUsedAt: null,
    };

    this.routes.push(newRoute);
    await this.persistRoute(newRoute, "route_added");

    logger.info(`New learned route added: "${id}" (${data.capability})`, {
      matchPatterns: data.matchPatterns.slice(0, 5),
      routeType: newRoute.routeType,
      target:
        newRoute.routeType === "api"
          ? newRoute.endpoint?.url
          : newRoute.agentId,
    });

    return newRoute;
  }

  async upsertRouteForAdmin(route: LearnedRoute): Promise<LearnedRoute> {
    this.ensureLoaded();
    const existingIndex = this.routes.findIndex((r) => r.id === route.id);
    if (existingIndex >= 0) {
      this.routes[existingIndex] = route;
    } else {
      this.routes.push(route);
    }

    await this.persistRoute(route, existingIndex >= 0 ? "route_updated" : "route_added");
    return route;
  }

  async deleteRouteForAdmin(routeId: string): Promise<boolean> {
    this.ensureLoaded();

    const existing = this.routes.find((r) => r.id === routeId);
    if (!existing) return false;

    this.routes = this.routes.filter((route) => route.id !== routeId);

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (repo) {
      await repo.deleteRoute(routeId);
      await repo.recordEvent({
        routeId,
        eventType: "route_deleted",
        details: { capability: existing.capability },
      });
    }

    if (!repo || this.dualWriteJsonEnabled()) {
      this.saveJson();
    }

    return true;
  }

  async incrementUsage(
    routeId: string,
    metadata?: {
      runId?: string;
      sessionId?: string;
      agentId?: string;
      requestContext?: RequestContext;
    }
  ): Promise<void> {
    this.ensureLoaded();

    const route = this.routes.find((r) => r.id === routeId);
    if (!route) return;

    route.usageCount += 1;
    route.lastUsedAt = new Date().toISOString();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (repo) {
      const updated = await repo.incrementUsage(routeId);
      if (updated) {
        const idx = this.routes.findIndex((r) => r.id === routeId);
        if (idx >= 0) this.routes[idx] = updated;
      }

      await repo.recordEvent({
        routeId,
        eventType: "route_used",
        runId: metadata?.runId,
        sessionId: metadata?.sessionId,
        audience: metadata?.requestContext?.audience,
        scope: metadata?.requestContext?.scope,
        brandId: metadata?.requestContext?.brandId,
        agentId: metadata?.agentId,
        details: { usageCount: route.usageCount },
      });
    }

    if (!repo || this.dualWriteJsonEnabled()) {
      this.saveJson();
    }
  }

  async upsertSlackHitlThreadForAdmin(thread: SlackHitlThreadInput): Promise<void> {
    this.ensureLoaded();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (!repo) return;

    const existing = await repo.getSlackHitlThreadByThreadTs(thread.threadTs);
    await repo.upsertSlackHitlThread({
      kind: thread.kind ?? existing?.kind ?? "route-learning",
      channel: thread.channel ?? existing?.channel ?? "",
      messageTs: thread.messageTs ?? existing?.messageTs ?? thread.threadTs,
      threadTs: thread.threadTs,
      status: thread.status ?? existing?.status ?? "sent",
      audience:
        thread.audience ?? (existing?.audience as "admin" | "marketer" | undefined) ?? "admin",
      scope:
        thread.scope ?? (existing?.scope as "global" | "brand" | undefined) ?? "global",
      brandId: thread.brandId ?? existing?.brandId ?? null,
      taskDescription: thread.taskDescription ?? existing?.taskDescription ?? null,
      reason: thread.reason ?? existing?.reason ?? null,
      severity: thread.severity ?? existing?.severity ?? null,
      runId: thread.runId ?? existing?.runId ?? null,
      sessionId: thread.sessionId ?? existing?.sessionId ?? null,
      agentId: thread.agentId ?? existing?.agentId ?? null,
      routeId: thread.routeId ?? existing?.routeId ?? null,
      respondedBy: thread.respondedBy ?? existing?.respondedBy ?? null,
      responseText: thread.responseText ?? existing?.responseText ?? null,
      addedRouteId: thread.addedRouteId ?? existing?.addedRouteId ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(thread.metadata ?? {}),
      },
      respondedAt: thread.respondedAt ?? existing?.respondedAt ?? null,
      resolvedAt: thread.resolvedAt ?? existing?.resolvedAt ?? null,
    });
  }

  async listSlackHitlThreadsForAdmin(options: {
    channel?: string;
    kind?: "escalation" | "route-learning" | "notification";
    status?: string;
    audience?: "admin" | "marketer";
    brandId?: string | null;
    limit?: number;
    offset?: number;
  } = {}): Promise<SlackHitlThreadRecord[]> {
    this.ensureLoaded();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (!repo) return [];

    return repo.listSlackHitlThreads(options);
  }

  async getSlackHitlSummaryForAdmin(options: {
    channel?: string;
    kind?: "escalation" | "route-learning" | "notification";
    audience?: "admin" | "marketer";
    brandId?: string | null;
  } = {}): Promise<SlackHitlSummaryRecord> {
    this.ensureLoaded();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (!repo) {
      return {
        total: 0,
        responded: 0,
        pending: 0,
        routeAdded: 0,
        approved: 0,
        dismissed: 0,
        rejected: 0,
        timedOut: 0,
        escalations: 0,
        routeLearning: 0,
        notifications: 0,
      };
    }

    return repo.getSlackHitlSummary(options);
  }

  async listEventsForAdmin(options: {
    routeId?: string;
    eventType?: string;
    audience?: "admin" | "marketer";
    brandId?: string | null;
    limit?: number;
    offset?: number;
  } = {}): Promise<LearnedRouteEventRecord[]> {
    this.ensureLoaded();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (!repo) return [];

    return repo.listEvents(options);
  }

  async listRoutesForAdmin(options: {
    q?: string;
    audience?: RouteAudience;
    scope?: RouteScope;
    brandId?: string | null;
    routeType?: "api" | "sub-agent";
    limit?: number;
    offset?: number;
  } = {}): Promise<LearnedRoute[]> {
    this.ensureLoaded();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (!repo) {
      const q = options.q?.trim().toLowerCase();
      const audience = options.audience;
      const scope = options.scope;
      const brandId = options.brandId ?? null;
      const routeType = options.routeType;
      const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
      const offset = Math.max(options.offset ?? 0, 0);

      return this.routes
        .filter((route) => {
          if (routeType && route.routeType !== routeType) return false;
          if (audience && route.audience !== audience) return false;
          if (scope && route.scope !== scope) return false;
          if (brandId && route.brandId !== brandId) return false;
          if (!q) return true;
          return (
            route.capability.toLowerCase().includes(q) ||
            route.description.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(offset, offset + limit);
    }

    const rows = await repo.listRoutes(options);
    return rows;
  }

  async getRouteByIdForAdmin(routeId: string): Promise<LearnedRoute | null> {
    this.ensureLoaded();

    const repo = this.dbEnabled ? this.resolveDbRepository() : null;
    if (!repo) {
      return this.getById(routeId);
    }

    const route = await repo.getRouteById(routeId);
    if (!route) return null;

    const existing = this.routes.findIndex((item) => item.id === route.id);
    if (existing >= 0) this.routes[existing] = route;
    else this.routes.push(route);

    return route;
  }

  async getAdminStats(): Promise<{
    total: number;
    apiRoutes: number;
    subAgentRoutes: number;
    dbEnabled: boolean;
    dualWriteJson: boolean;
  }> {
    this.ensureLoaded();

    const total = this.routes.length;
    const apiRoutes = this.routes.filter((route) => route.routeType === "api").length;
    const subAgentRoutes = this.routes.filter(
      (route) => route.routeType === "sub-agent"
    ).length;

    return {
      total,
      apiRoutes,
      subAgentRoutes,
      dbEnabled: this.dbEnabled,
      dualWriteJson: this.dualWriteJsonEnabled(),
    };
  }

  getAll(): LearnedRoute[] {
    this.ensureLoaded();
    return [...this.routes];
  }

  getSummary(requestContext?: RequestContext): RouteSummary[] {
    this.ensureLoaded();

    return [...this.routes]
      .filter((route) => routeMatchesRequestContext(route, requestContext))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        capability: r.capability,
        description: r.description,
        audience: r.audience,
        scope: r.scope,
        brandId: r.brandId,
        matchPatterns: r.matchPatterns,
        routeType: r.routeType,
        agentId: r.agentId,
        endpointUrl: r.endpoint?.url,
        workflowType: r.apiWorkflow?.workflowType,
      }));
  }

  count(): number {
    this.ensureLoaded();
    return this.routes.length;
  }

  isDbBacked(): boolean {
    return this.dbEnabled;
  }
}

export const learnedRoutesStore = new LearnedRoutesStoreImpl();

function routeMatchesRequestContext(
  route: LearnedRoute,
  requestContext?: RequestContext
): boolean {
  if (!requestContext) return true;
  if (!allowsAudience(route.audience, requestContext.audience)) return false;
  if (route.scope === "global") return true;
  return route.brandId === requestContext.brandId;
}

function compareRoutePriority(a: LearnedRoute, b: LearnedRoute): number {
  const aRank = routePriorityRank(a);
  const bRank = routePriorityRank(b);
  if (aRank !== bRank) return aRank - bRank;
  if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
  return a.id.localeCompare(b.id) * -1;
}

function routePriorityRank(route: LearnedRoute): number {
  if (route.routeType === "sub-agent" && route.agentId === "mcp-fetcher") return 4;
  if (route.routeType === "sub-agent") return 3;
  if (route.routeType === "api" && route.apiWorkflow?.workflowType) return 2;
  return 1;
}
