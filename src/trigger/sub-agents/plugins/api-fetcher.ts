import { z } from "zod";
import { type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext, AgentResult } from "../../../core/types.js";
import { learnedRoutesStore } from "../../../routing/learned-routes-store.js";
import { logger } from "../../../core/logger.js";
import { loadAgentPromptSpec } from "../../../tools/agent-spec-loader.js";

// ── Schemas ─────────────────────────────────────────────────

const ApiFetcherInput = z
  .object({
    routeId: z.string().describe("The learned route ID to use"),
    params: z
      .record(z.unknown())
      .optional()
      .default({})
      .describe("Parameters to substitute into the API call"),
    description: z
      .string()
      .optional()
      .describe("Original task description for context"),
  })
  .passthrough();

const ApiFetcherOutput = z.object({
  routeId: z.string(),
  endpoint: z.string(),
  statusCode: z.number(),
  data: z.unknown(),
  fetchedAt: z.string(),
});

type PromptLoader = typeof loadAgentPromptSpec;

export const API_FETCHER_SYSTEM_PROMPT_FILE =
  "knowledge/sub-agents/api-fetcher/system-prompt.md";

export const API_FETCHER_SYSTEM_PROMPT_FALLBACK = `You are the API Fetcher sub-agent.

Your role is to retrieve data from learned API endpoints and return reliable execution results.

## What you do
- Resolve learned route templates (URL, headers, query params)
- Execute HTTP requests against configured endpoints
- Return structured fetch results with status and payload
- Surface execution errors clearly for downstream handling

## Output expectations
- Return machine-readable output compatible with Agency aggregation.
- Include route ID, resolved endpoint, status code, data, and execution timestamp.

## Rules
- Use learned routes from knowledge/learned-routes.json as the source of truth.
- Do not invent endpoint details when route configuration is missing.
- If route config is invalid/missing, return a clear error payload.
- {{SKILL_CREATION_INSTRUCTION}}`;

// ── Template Resolution ─────────────────────────────────────

function resolveTemplateString(
  template: string,
  params: Record<string, unknown>
): string {
  return template
    .replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, envVar) => process.env[envVar] ?? "")
    .replace(/\{\{input\.(\w+)\}\}/g, (_, key) => String(params[key] ?? ""));
}

function resolveTemplateObject(
  obj: Record<string, string>,
  params: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, resolveTemplateString(v, params)])
  );
}

// ── Plugin ──────────────────────────────────────────────────

export class ApiFetcherAgent extends BaseSubAgent {
  id = "api-fetcher";
  name = "API Fetcher";
  description =
    "Fetches data from previously learned API endpoints. " +
    "Uses routes defined in knowledge/learned-routes.json.";
  version = "1.0.0";
  capabilities = ["api-fetch", "learned-route-execution", "data-retrieval"];

  inputSchema = ApiFetcherInput;
  outputSchema = ApiFetcherOutput;
  private promptLoader: PromptLoader;
  private promptFile: string;

  constructor(options?: { promptLoader?: PromptLoader; promptFile?: string }) {
    super("anthropic:fast", ["openai:fast", "google:fast"], 3, 0.1);
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? API_FETCHER_SYSTEM_PROMPT_FILE;
  }

  /**
   * Override execute to fetch from the learned route directly.
   * No AI model call needed — this is a pure data-fetch agent.
   */
  async execute(
    input: unknown,
    _context: ExecutionContext
  ): Promise<AgentResult> {
    const parsed = ApiFetcherInput.safeParse(input);

    if (!parsed.success) {
      logger.warn("api-fetcher: invalid input", {
        errors: parsed.error.flatten(),
      });
      return {
        success: false,
        output: JSON.stringify({
          error: "Invalid input for api-fetcher",
          details: parsed.error.flatten(),
        }),
        modelUsed: "none",
      };
    }

    const { routeId, params } = parsed.data;
    const route = learnedRoutesStore.getById(routeId);

    if (!route) {
      logger.warn(`api-fetcher: route "${routeId}" not found`);
      return {
        success: false,
        output: JSON.stringify({
          error: `Learned route "${routeId}" not found in knowledge/learned-routes.json`,
        }),
        modelUsed: "none",
      };
    }

    if (route.routeType !== "api" || !route.endpoint) {
      logger.warn(`api-fetcher: route "${routeId}" is not an API route`);
      return {
        success: false,
        output: JSON.stringify({
          error: `Learned route "${routeId}" is not an API route`,
        }),
        modelUsed: "none",
      };
    }

    try {
      // Resolve templates
      const resolvedUrl = resolveTemplateString(route.endpoint.url, params);
      const resolvedHeaders = resolveTemplateObject(
        route.endpoint.headers ?? {},
        params
      );
      const resolvedQueryParams = resolveTemplateObject(
        route.endpoint.queryParams ?? {},
        params
      );

      // Build URL with query params
      const url = new URL(resolvedUrl);
      for (const [key, value] of Object.entries(resolvedQueryParams)) {
        if (value) url.searchParams.set(key, value);
      }

      logger.info(`api-fetcher: executing route "${routeId}"`, {
        url: url.toString(),
        method: route.endpoint.method,
      });

      // Execute the fetch
      const response = await fetch(url.toString(), {
        method: route.endpoint.method,
        headers: resolvedHeaders,
        ...(route.endpoint.bodyTemplate && route.endpoint.method !== "GET"
          ? { body: JSON.stringify(route.endpoint.bodyTemplate) }
          : {}),
      });

      const data =
        route.outputFormat === "json"
          ? await response.json()
          : await response.text();

      // Track usage
      learnedRoutesStore.incrementUsage(routeId);

      const output = {
        routeId,
        endpoint: url.toString(),
        statusCode: response.status,
        data,
        fetchedAt: new Date().toISOString(),
      };

      logger.info(`api-fetcher: route "${routeId}" completed`, {
        statusCode: response.status,
        success: response.ok,
      });

      return {
        success: response.ok,
        output: JSON.stringify(output),
        modelUsed: "api-fetcher (no model)",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      logger.error(`api-fetcher: fetch failed for route "${routeId}"`, {
        error: message,
      });

      return {
        success: false,
        output: JSON.stringify({
          routeId,
          error: `API fetch failed: ${message}`,
        }),
        modelUsed: "none",
      };
    }
  }

  // AI-based methods (kept for compatibility, not used in fetch mode)

  getSystemPrompt(context: ExecutionContext): string {
    const vars = {
      SKILL_CREATION_INSTRUCTION: this.getSkillCreationInstruction(),
      BRAND_NAME: context.brandIdentity.name,
    };
    return this.promptLoader(
      this.id,
      this.promptFile,
      API_FETCHER_SYSTEM_PROMPT_FALLBACK,
      vars
    );
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return {};
  }
}

// Auto-register on import
import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new ApiFetcherAgent());
