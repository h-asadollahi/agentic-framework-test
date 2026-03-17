import { Hono } from "hono";
import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { logger } from "../core/logger.js";
import { createAdminRequestContext } from "../core/request-context.js";
import { shortTermMemory } from "../memory/short-term.js";
import { llmUsageStore } from "../observability/llm-usage-store.js";
import {
  fetchTriggerRunSummary,
  retrieveTriggerRun,
} from "../platform/trigger-runs.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { LearnedRouteSchema } from "../routing/learned-routes-schema.js";
import {
  exportLearnedRoutesFromDbToJson,
  importLearnedRoutesFromJsonToDb,
} from "../routing/learned-routes-migration.js";
import { brandStore, DEFAULT_SEEDED_BRAND_ID } from "../tenancy/brand-store.js";
import { createAdminAuthMiddleware } from "./auth.js";

const CreateRouteSchema = z
  .object({
    capability: z.string().min(1),
    description: z.string().min(1),
    matchPatterns: z.array(z.string().min(1)).min(1),
    audience: z.enum(["admin", "marketer", "all"]).optional().default("marketer"),
    scope: z.enum(["global", "brand"]).optional().default("global"),
    brandId: z.string().trim().min(1).optional().nullable(),
    routeType: z.enum(["api", "sub-agent"]).optional().default("api"),
    endpoint: z
      .object({
        url: z.string().min(1),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        headers: z.record(z.string()).optional().default({}),
        queryParams: z.record(z.string()).optional().default({}),
        bodyTemplate: z.record(z.unknown()).optional(),
      })
      .optional(),
    apiWorkflow: z
      .object({
        workflowType: z
          .enum(["single-request", "analysis-query", "report-query"])
          .default("single-request"),
        requestBodySource: z.string().optional(),
        poll: z
          .object({
            intervalMs: z.number().int().positive().default(2000),
            maxAttempts: z.number().int().positive().default(30),
          })
          .optional(),
        resultSelection: z.enum(["all-success", "first-success"]).default("all-success"),
      })
      .optional(),
    agentId: z.string().optional(),
    agentInputDefaults: z.record(z.unknown()).optional().default({}),
    inputMapping: z.record(z.string()).optional().default({}),
    outputFormat: z.enum(["json", "text", "csv"]).optional().default("json"),
    addedBy: z.string().optional().default("admin"),
  })
  .superRefine((value, ctx) => {
    if (value.routeType === "api" && !value.endpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endpoint"],
        message: "endpoint is required when routeType is api",
      });
    }
    if (value.routeType === "sub-agent" && !value.agentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentId"],
        message: "agentId is required when routeType is sub-agent",
      });
    }
    if (value.scope === "brand" && !value.brandId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brandId"],
        message: "brandId is required when scope is brand",
      });
    }
    if (value.scope === "global" && value.brandId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brandId"],
        message: "brandId must be empty when scope is global",
      });
    }
  });

const BackfillSchema = z.object({
  jsonFile: z.string().optional(),
});

const AdminChatMessageSchema = z.object({
  userMessage: z.string().min(1, "Message is required"),
  sessionId: z.string().optional(),
  brandId: z.string().trim().min(1).optional().nullable(),
});

function parseIntParam(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function parseSlackKind(
  value: string | undefined
): "escalation" | "route-learning" | "notification" | undefined {
  return value === "escalation" || value === "route-learning" || value === "notification"
    ? value
    : undefined;
}

function defaultAdminSlackChannel(): string | undefined {
  const value = process.env.SLACK_ADMIN_HITL_CHANNEL?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseRequestAudience(
  value: string | undefined
): "admin" | "marketer" | undefined {
  return value === "admin" || value === "marketer" ? value : undefined;
}

function parseRouteAudience(
  value: string | undefined
): "admin" | "marketer" | "all" | undefined {
  return value === "admin" || value === "marketer" || value === "all"
    ? value
    : undefined;
}

function parseScope(
  value: string | undefined
): "global" | "brand" | undefined {
  return value === "global" || value === "brand" ? value : undefined;
}

function parseBrandId(value: string | undefined): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function registerAdminRoutes(app: Hono): void {
  const admin = new Hono();
  admin.use("*", createAdminAuthMiddleware());

  admin.get("/brands", async (c) => {
    const brands = await brandStore.listBrands();
    return c.json({
      brands,
      defaultBrandId: DEFAULT_SEEDED_BRAND_ID,
    });
  });

  admin.get("/health", async (c) => {
    const [stats, brands] = await Promise.all([
      learnedRoutesStore.getAdminStats(),
      brandStore.listBrands(),
    ]);
    return c.json({
      status: "ok",
      dbBacked: learnedRoutesStore.isDbBacked(),
      stats,
      brands: brands.length,
      timestamp: new Date().toISOString(),
    });
  });

  admin.get("/routes", async (c) => {
    const q = c.req.query("q");
    const routeType = c.req.query("routeType");
    const audience = parseRouteAudience(c.req.query("audience"));
    const scope = parseScope(c.req.query("scope"));
    const brandId = parseBrandId(c.req.query("brandId"));
    const limit = parseIntParam(c.req.query("limit"), 100);
    const offset = parseIntParam(c.req.query("offset"), 0);

    const routes = await learnedRoutesStore.listRoutesForAdmin({
      q: q || undefined,
      audience,
      scope,
      brandId,
      routeType:
        routeType === "api" || routeType === "sub-agent"
          ? routeType
          : undefined,
      limit,
      offset,
    });
    const stats = await learnedRoutesStore.getAdminStats();

    return c.json({ routes, stats, limit, offset });
  });

  admin.get("/routes/:routeId", async (c) => {
    const routeId = c.req.param("routeId");
    const route = await learnedRoutesStore.getRouteByIdForAdmin(routeId);
    if (!route) {
      return c.json({ error: "Route not found" }, 404);
    }
    return c.json({ route });
  });

  admin.post("/routes", async (c) => {
    const body = await c.req.json();
    const parsed = CreateRouteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const route = await learnedRoutesStore.addRoute(parsed.data);
    return c.json({ route }, 201);
  });

  admin.put("/routes/:routeId", async (c) => {
    const routeId = c.req.param("routeId");
    const body = await c.req.json();
    const existing = await learnedRoutesStore.getRouteByIdForAdmin(routeId);
    if (!existing) {
      return c.json({ error: "Route not found" }, 404);
    }

    const parsed = LearnedRouteSchema.safeParse({
      ...existing,
      ...body,
      id: routeId,
    });
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const route = await learnedRoutesStore.upsertRouteForAdmin(parsed.data);
    return c.json({ route });
  });

  admin.delete("/routes/:routeId", async (c) => {
    const routeId = c.req.param("routeId");
    const deleted = await learnedRoutesStore.deleteRouteForAdmin(routeId);
    if (!deleted) {
      return c.json({ error: "Route not found" }, 404);
    }
    return c.json({ deleted: true, routeId });
  });

  admin.get("/events", async (c) => {
    const routeId = c.req.query("routeId");
    const eventType = c.req.query("eventType");
    const audience = parseRequestAudience(c.req.query("audience"));
    const brandId = parseBrandId(c.req.query("brandId"));
    const limit = parseIntParam(c.req.query("limit"), 200);
    const offset = parseIntParam(c.req.query("offset"), 0);

    const events = await learnedRoutesStore.listEventsForAdmin({
      routeId: routeId || undefined,
      eventType: eventType || undefined,
      audience,
      brandId,
      limit,
      offset,
    });

    return c.json({ events, limit, offset });
  });

  admin.get("/runs/summary", async (c) => {
    const limit = parseIntParam(c.req.query("limit"), 20);
    try {
      const summary = await fetchTriggerRunSummary(limit);
      return c.json(summary);
    } catch (error) {
      logger.warn("Failed to fetch Trigger run summary for admin endpoint", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: "Failed to fetch run summary",
          detail: error instanceof Error ? error.message : String(error),
        },
        502
      );
    }
  });

  admin.get("/slack/summary", async (c) => {
    const channel = c.req.query("channel") || defaultAdminSlackChannel();
    const kind = parseSlackKind(c.req.query("kind"));
    const audience = parseRequestAudience(c.req.query("audience"));
    const brandId = parseBrandId(c.req.query("brandId"));
    const summary = await learnedRoutesStore.getSlackHitlSummaryForAdmin({
      channel,
      kind,
      audience,
      brandId,
    });

    return c.json({
      configuredAdminChannel: defaultAdminSlackChannel() ?? null,
      channelFilter: channel ?? null,
      kindFilter: kind ?? null,
      summary,
    });
  });

  admin.get("/slack/messages", async (c) => {
    const channel = c.req.query("channel") || defaultAdminSlackChannel();
    const kind = parseSlackKind(c.req.query("kind"));
    const statusFilter = c.req.query("status") || undefined;
    const audience = parseRequestAudience(c.req.query("audience"));
    const brandId = parseBrandId(c.req.query("brandId"));
    const limit = parseIntParam(c.req.query("limit"), 20);
    const offset = parseIntParam(c.req.query("offset"), 0);
    const messages = await learnedRoutesStore.listSlackHitlThreadsForAdmin({
      channel,
      kind,
      status: statusFilter,
      audience,
      brandId,
      limit,
      offset,
    });

    return c.json({
      configuredAdminChannel: defaultAdminSlackChannel() ?? null,
      channelFilter: channel ?? null,
      kindFilter: kind ?? null,
      statusFilter: statusFilter ?? null,
      limit,
      offset,
      messages,
    });
  });

  admin.get("/llm-usage/summary", async (c) => {
    const audience = parseRequestAudience(c.req.query("audience")) ?? "marketer";
    const brandId = parseBrandId(c.req.query("brandId")) ?? null;
    const days = Math.min(Math.max(parseIntParam(c.req.query("days"), 7), 1), 365);

    if (brandId) {
      try {
        await brandStore.assertBrandExists(brandId);
      } catch (error) {
        return c.json(
          {
            error: "Unknown brand",
            details: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    }

    const summary = await llmUsageStore.getSummary({
      audience,
      brandId,
      days,
    });

    return c.json({
      audience,
      brandId,
      days,
      summary,
    });
  });

  admin.post("/chat/message", async (c) => {
    const body = await c.req.json();
    const parsed = AdminChatMessageSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const sessionId = parsed.data.sessionId || crypto.randomUUID();
    const brandId = parsed.data.brandId ?? null;
    if (brandId) {
      try {
        await brandStore.assertBrandExists(brandId);
      } catch (error) {
        return c.json(
          {
            error: "Unknown brand",
            details: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    }

    const requestContext = createAdminRequestContext({
      brandId,
      source: "admin-ui",
    });

    shortTermMemory.addMessage(sessionId, {
      role: "user",
      content: parsed.data.userMessage,
      metadata: {
        audience: requestContext.audience,
        brandId: requestContext.brandId,
        scope: requestContext.scope,
        source: requestContext.source,
      },
    });

    const handle = await tasks.trigger("orchestrate-pipeline", {
      userMessage: parsed.data.userMessage,
      sessionId,
      requestContext,
    });

    return c.json({
      runId: handle.id,
      sessionId,
      brandId,
      status: "triggered",
    });
  });

  admin.get("/chat/status/:runId", async (c) => {
    const runId = c.req.param("runId");

    try {
      const run = await retrieveTriggerRun(runId);

      return c.json({
        runId: run.id,
        status: run.status,
        output: run.output ?? null,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        finishedAt: run.finishedAt ?? null,
      });
    } catch (error) {
      return c.json(
        { error: "Run not found", details: String(error) },
        404
      );
    }
  });

  admin.get("/chat/session/:sessionId/history", (c) => {
    const sessionId = c.req.param("sessionId");

    if (!shortTermMemory.has(sessionId)) {
      return c.json({ error: "Session not found" }, 404);
    }

    const history = shortTermMemory.getRecentHistory(sessionId, 50);
    return c.json({ sessionId, messages: history });
  });

  admin.delete("/chat/session/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    shortTermMemory.clear(sessionId);
    return c.json({ sessionId, cleared: true });
  });

  admin.post("/backfill/import", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = BackfillSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    try {
      const result = await importLearnedRoutesFromJsonToDb(parsed.data);
      await learnedRoutesStore.load();
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: "Backfill import failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });

  admin.post("/backfill/export", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = BackfillSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    try {
      const result = await exportLearnedRoutesFromDbToJson(parsed.data);
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: "Backfill export failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });

  app.route("/admin", admin);
}
