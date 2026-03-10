import { Hono } from "hono";
import { z } from "zod";
import { logger } from "../core/logger.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { LearnedRouteSchema } from "../routing/learned-routes-schema.js";
import {
  exportLearnedRoutesFromDbToJson,
  importLearnedRoutesFromJsonToDb,
} from "../routing/learned-routes-migration.js";
import { createAdminAuthMiddleware } from "./auth.js";

const CreateRouteSchema = z
  .object({
  capability: z.string().min(1),
  description: z.string().min(1),
  matchPatterns: z.array(z.string().min(1)).min(1),
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
  });

const BackfillSchema = z.object({
  jsonFile: z.string().optional(),
});

function parseIntParam(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

async function fetchRunSummary(limit: number): Promise<{
  total: number;
  byStatus: Record<string, number>;
  latest: Array<{
    id: string;
    status: string;
    taskIdentifier: string | null;
    createdAt: string | null;
    finishedAt: string | null;
  }>;
}> {
  const apiUrl = process.env.TRIGGER_API_URL ?? "http://localhost:3040";
  const token = process.env.TRIGGER_SECRET_KEY?.trim();

  if (!token) {
    return {
      total: 0,
      byStatus: {},
      latest: [],
    };
  }

  const response = await fetch(`${apiUrl}/api/v3/runs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Trigger run summary fetch failed: ${response.status}`);
  }

  const body = await response.json();
  const runs = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.runs)
      ? body.runs
      : [];

  const byStatus: Record<string, number> = {};
  for (const run of runs) {
    const status =
      typeof run?.status === "string" && run.status.length > 0
        ? run.status
        : "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    total: runs.length,
    byStatus,
    latest: runs.slice(0, limit).map((run: Record<string, unknown>) => ({
      id: String(run.id ?? ""),
      status: String(run.status ?? "unknown"),
      taskIdentifier:
        typeof run.taskIdentifier === "string"
          ? run.taskIdentifier
          : typeof run.taskSlug === "string"
            ? run.taskSlug
            : null,
      createdAt: typeof run.createdAt === "string" ? run.createdAt : null,
      finishedAt: typeof run.finishedAt === "string" ? run.finishedAt : null,
    })),
  };
}

export function registerAdminRoutes(app: Hono): void {
  const admin = new Hono();
  admin.use("*", createAdminAuthMiddleware());

  admin.get("/health", async (c) => {
    const stats = await learnedRoutesStore.getAdminStats();
    return c.json({
      status: "ok",
      dbBacked: learnedRoutesStore.isDbBacked(),
      stats,
      timestamp: new Date().toISOString(),
    });
  });

  admin.get("/routes", async (c) => {
    const q = c.req.query("q");
    const routeType = c.req.query("routeType");
    const limit = parseIntParam(c.req.query("limit"), 100);
    const offset = parseIntParam(c.req.query("offset"), 0);

    const routes = await learnedRoutesStore.listRoutesForAdmin({
      q: q || undefined,
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
    const limit = parseIntParam(c.req.query("limit"), 200);
    const offset = parseIntParam(c.req.query("offset"), 0);

    const events = await learnedRoutesStore.listEventsForAdmin({
      routeId: routeId || undefined,
      eventType: eventType || undefined,
      limit,
      offset,
    });

    return c.json({ events, limit, offset });
  });

  admin.get("/runs/summary", async (c) => {
    const limit = parseIntParam(c.req.query("limit"), 20);
    try {
      const summary = await fetchRunSummary(limit);
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
