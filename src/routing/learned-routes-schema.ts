import { z } from "zod";

// ── Endpoint Schema ─────────────────────────────────────────

export const EndpointSchema = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  headers: z.record(z.string()).optional().default({}),
  queryParams: z.record(z.string()).optional().default({}),
  bodyTemplate: z.record(z.unknown()).optional(),
});

export const ApiWorkflowSchema = z
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
  .optional();

// ── Learned Route Schema ────────────────────────────────────

export const LearnedRouteSchema = z.object({
  id: z.string(),
  capability: z.string(),
  description: z.string(),
  matchPatterns: z.array(z.string()).min(1),
  routeType: z.enum(["api", "sub-agent"]).default("api"),
  endpoint: EndpointSchema.optional(),
  apiWorkflow: ApiWorkflowSchema,
  agentId: z.string().optional(),
  agentInputDefaults: z.record(z.unknown()).optional().default({}),
  inputMapping: z.record(z.string()).optional().default({}),
  outputFormat: z.enum(["json", "text", "csv"]).default("json"),
  addedAt: z.string(),
  addedBy: z.string(),
  usageCount: z.number().default(0),
  lastUsedAt: z.string().nullable().default(null),
}).superRefine((route, ctx) => {
  if (route.routeType === "api" && !route.endpoint) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endpoint"],
      message: "endpoint is required when routeType is 'api'",
    });
  }

  if (route.routeType === "sub-agent" && !route.agentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["agentId"],
      message: "agentId is required when routeType is 'sub-agent'",
    });
  }
});

// ── File Schema ─────────────────────────────────────────────

export const LearnedRoutesFileSchema = z.object({
  version: z.string().default("1.0.0"),
  lastUpdated: z.string(),
  routes: z.array(LearnedRouteSchema),
});

// ── Exported Types ──────────────────────────────────────────

export type Endpoint = z.infer<typeof EndpointSchema>;
export type ApiWorkflow = z.infer<typeof ApiWorkflowSchema>;
export type LearnedRoute = z.infer<typeof LearnedRouteSchema>;
export type LearnedRoutesFile = z.infer<typeof LearnedRoutesFileSchema>;
