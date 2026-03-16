import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext, AgentResult } from "../../../core/types.js";
import { learnedRoutesStore } from "../../../routing/learned-routes-store.js";
import type { LearnedRoute } from "../../../routing/learned-routes-schema.js";
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

const ApiFetcherOutput = z
  .object({
    routeId: z.string(),
    workflowType: z.string(),
    fetchedAt: z.string(),
    data: z.unknown(),
    preflight: z.unknown().optional(),
  })
  .passthrough();

type PromptLoader = typeof loadAgentPromptSpec;

type JsonRecord = Record<string, unknown>;

type PollConfig = {
  intervalMs: number;
  maxAttempts: number;
};

type ParsedHttpResponse = {
  ok: boolean;
  statusCode: number;
  data: unknown;
  rawBody: string;
};

type RequestSpec = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type MappTokenCache = {
  token: string;
  expiresAt: number;
};

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_ATTEMPTS = 30;

const API_FETCHER_SYSTEM_PROMPT_FILE =
  "knowledge/sub-agents/api-fetcher/system-prompt.md";

const MCP_BUILDER_SKILL_PATH = "skills/mcp-builder-SKILL.md";

let runtimeMappToken: MappTokenCache | null = null;

export const API_FETCHER_SYSTEM_PROMPT_FALLBACK = `You are the API Fetcher sub-agent.

Your role is to retrieve data from learned API endpoints and return reliable execution results.

## What you do
- Resolve learned route templates (URL, headers, query params, and request bodies)
- Execute HTTP requests against configured endpoints
- Run deterministic workflow preflight guidance based on ./skills/mcp-builder-SKILL.md for API-call routes
- Support analysis-query and report-query orchestration for Mapp Intelligence API
- Return compact structured results suitable for Agency aggregation

## Output expectations
- Return machine-readable output compatible with Agency aggregation.
- Include route ID, workflowType, fetchedAt, preflight metadata, and compact data summary.

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

function resolveTemplateValue(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return resolveTemplateString(value, params);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, params));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, entry]) => [
        key,
        resolveTemplateValue(entry, params),
      ])
    );
  }
  return value;
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseUrlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function createPollConfig(route: LearnedRoute): PollConfig {
  return {
    intervalMs: route.apiWorkflow?.poll?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    maxAttempts: route.apiWorkflow?.poll?.maxAttempts ?? DEFAULT_POLL_ATTEMPTS,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function readJsonFile(filePath: string): unknown {
  const absolutePath = resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`requestBodySource file not found: ${filePath}`);
  }

  const raw = readFileSync(absolutePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `requestBodySource file is not valid JSON: ${filePath}. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function isMappAnalyticsEndpoint(url: string): boolean {
  const analyticsBase = process.env.MAPP_ANALYTICS_API_URL;
  if (!analyticsBase) return false;

  try {
    const target = new URL(url);
    const base = new URL(analyticsBase);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}

function getConfiguredMappToken(): string | null {
  if (runtimeMappToken && runtimeMappToken.expiresAt > Date.now()) {
    return runtimeMappToken.token;
  }

  const envToken = process.env.MAPP_ANALYTICS_API_TOKEN;
  if (envToken && envToken.trim().length > 0) return envToken;
  return null;
}

async function refreshMappToken(): Promise<string | null> {
  const analyticsBase = process.env.MAPP_ANALYTICS_API_URL;
  const clientId = process.env.MAPP_ANALYTICS_API_CLIENT_ID;
  const clientSecret = process.env.MAPP_ANALYTICS_API_CLIENT_SECRET;

  if (!analyticsBase || !clientId || !clientSecret) {
    logger.warn("api-fetcher: mapp token refresh skipped due to missing env vars");
    return null;
  }

  const tokenUrl = `${analyticsBase.replace(/\/$/, "")}/analytics/api/oauth/token?grant_type=client_credentials&scope=mapp.intelligence-api`;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    const raw = await response.text();
    const parsed = asRecord(safeJsonParse(raw));

    if (!response.ok) {
      logger.warn("api-fetcher: mapp token refresh failed", {
        statusCode: response.status,
        bodyPreview: raw.slice(0, 180),
      });
      return null;
    }

    const token = normalizeString(parsed.access_token);
    const expiresInRaw = parsed.expires_in;
    const expiresIn =
      typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw)
        ? Math.max(60, expiresInRaw)
        : 3600;

    if (!token) {
      logger.warn("api-fetcher: token refresh response missing access_token");
      return null;
    }

    runtimeMappToken = {
      token,
      expiresAt: Date.now() + (expiresIn - 30) * 1000,
    };

    return token;
  } catch (error) {
    logger.warn("api-fetcher: token refresh request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function performRequest(spec: RequestSpec): Promise<ParsedHttpResponse> {
  const headers = { ...spec.headers };
  if (!headers.Accept) headers.Accept = "application/json";

  const mappEndpoint = isMappAnalyticsEndpoint(spec.url);

  if (mappEndpoint) {
    const token = getConfiguredMappToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const executeFetch = async (localHeaders: Record<string, string>) =>
    fetch(spec.url, {
      method: spec.method,
      headers: localHeaders,
      ...(spec.body ? { body: spec.body } : {}),
    });

  let response = await executeFetch(headers);

  if (mappEndpoint && response.status === 401) {
    const refreshedToken = await refreshMappToken();
    if (refreshedToken) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${refreshedToken}`,
      };
      response = await executeFetch(retryHeaders);
    }
  }

  const rawBody = await response.text();
  return {
    ok: response.ok,
    statusCode: response.status,
    data: safeJsonParse(rawBody),
    rawBody,
  };
}

function summarizeAnalysisData(data: unknown): JsonRecord {
  const record = asRecord(data);
  const headers = Array.isArray(record.headers) ? record.headers : [];
  const rows = Array.isArray(record.rows) ? record.rows : [];

  return {
    rowCount:
      typeof record.rowCount === "number" ? record.rowCount : rows.length,
    rowCountTotal:
      typeof record.rowCountTotal === "number" ? record.rowCountTotal : null,
    columnCount:
      typeof record.columnCount === "number" ? record.columnCount : headers.length,
    timerange: Array.isArray(record.timerange) ? record.timerange : null,
    timestamp: normalizeString(record.timestamp),
    headers: headers
      .slice(0, 20)
      .map((header) => {
        const item = asRecord(header);
        return item.name ?? item.alias ?? null;
      })
      .filter((value) => typeof value === "string"),
    sampleRows: rows.slice(0, 5),
  };
}

function extractPreflightPhases(skillText: string): string[] {
  return skillText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("### Phase"))
    .slice(0, 5);
}

function buildMcpBuilderPreflight(
  route: LearnedRoute,
  workflowType: string,
  requestBodySource: string | null
): JsonRecord {
  const checks = [
    "Validate workflow type and endpoint alignment with Postman collection.",
    "Ensure authentication strategy and retry behavior are deterministic.",
    "Keep output compact and actionable for downstream aggregation.",
  ];

  if (requestBodySource) {
    checks.push(`Validate JSON template file exists and is valid: ${requestBodySource}`);
  }

  const absoluteSkillPath = resolve(process.cwd(), MCP_BUILDER_SKILL_PATH);
  if (!existsSync(absoluteSkillPath)) {
    return {
      applied: false,
      skillPath: MCP_BUILDER_SKILL_PATH,
      workflowType,
      checks,
      note: "mcp-builder skill file missing; executed with fallback deterministic checklist.",
      routeId: route.id,
    };
  }

  const skillText = readFileSync(absoluteSkillPath, "utf-8");
  const phases = extractPreflightPhases(skillText);

  return {
    applied: true,
    skillPath: MCP_BUILDER_SKILL_PATH,
    workflowType,
    routeId: route.id,
    phases,
    checks,
  };
}

function extractCalculationId(data: unknown): string | null {
  const record = asRecord(data);
  return (
    normalizeString(record.calculationId) ??
    normalizeString(record.id) ??
    null
  );
}

function extractCorrelationId(data: unknown): string | null {
  const record = asRecord(data);
  return normalizeString(record.correlationId) ?? null;
}

function extractReportCorrelationId(data: unknown): string | null {
  const record = asRecord(data);
  return (
    normalizeString(record.reportCorrelationId) ??
    normalizeString(record.correlationId) ??
    null
  );
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isTerminalSuccessStatus(status: string): boolean {
  return ["SUCCESS", "DONE", "FINISHED", "COMPLETED"].includes(status);
}

function isTerminalFailureStatus(status: string): boolean {
  return ["FAILED", "ERROR", "CANCELLED", "ABORTED"].includes(status);
}

function buildAnalysisStatusUrl(baseEndpointUrl: string, correlationId: string): string {
  const origin = parseUrlOrigin(baseEndpointUrl);
  if (!origin) {
    throw new Error("Unable to derive analysis status URL from endpoint URL");
  }
  return `${origin}/analytics/api/analysis-query/${encodeURIComponent(correlationId)}`;
}

function buildAnalysisResultUrl(baseEndpointUrl: string, calculationId: string): string {
  const origin = parseUrlOrigin(baseEndpointUrl);
  if (!origin) {
    throw new Error("Unable to derive analysis result URL from endpoint URL");
  }
  return `${origin}/analytics/api/analysis-result/${encodeURIComponent(calculationId)}`;
}

function buildReportStatusUrl(baseEndpointUrl: string, reportCorrelationId: string): string {
  const origin = parseUrlOrigin(baseEndpointUrl);
  if (!origin) {
    throw new Error("Unable to derive report status URL from endpoint URL");
  }
  return `${origin}/analytics/api/report-query/${encodeURIComponent(reportCorrelationId)}`;
}

function pickCalculationIds(
  queryStates: unknown[],
  resultSelection: "all-success" | "first-success"
): string[] {
  const successful = queryStates
    .map((entry) => asRecord(entry))
    .filter((entry) =>
      isTerminalSuccessStatus(normalizeStatus(entry.status)) &&
      typeof entry.calculationId === "string"
    )
    .map((entry) => String(entry.calculationId));

  if (successful.length === 0) return [];
  if (resultSelection === "first-success") return [successful[0]];
  return successful;
}

function createRequestBody(
  route: LearnedRoute,
  params: Record<string, unknown>
): { body: unknown; source: string | null } {
  const source = normalizeString(route.apiWorkflow?.requestBodySource);
  if (source) {
    const template = readJsonFile(source);
    return {
      body: resolveTemplateValue(template, params),
      source,
    };
  }

  if (route.endpoint?.bodyTemplate) {
    return {
      body: resolveTemplateValue(route.endpoint.bodyTemplate, params),
      source: null,
    };
  }

  return { body: undefined, source: source ?? null };
}

async function executeSingleRequest(
  route: LearnedRoute,
  endpointUrl: string,
  method: RequestSpec["method"],
  headers: Record<string, string>,
  body: unknown
): Promise<JsonRecord> {
  const request = await performRequest({
    method,
    url: endpointUrl,
    headers,
    ...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
  });

  return {
    success: request.ok,
    endpoint: endpointUrl,
    statusCode: request.statusCode,
    data: request.data,
  };
}

async function executeAnalysisQueryWorkflow(
  route: LearnedRoute,
  endpointUrl: string,
  method: RequestSpec["method"],
  headers: Record<string, string>,
  body: unknown
): Promise<JsonRecord> {
  const poll = createPollConfig(route);

  const createResponse = await performRequest({
    method,
    url: endpointUrl,
    headers,
    ...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
  });

  const createData = asRecord(createResponse.data);
  let calculationId = extractCalculationId(createData);
  const correlationId = extractCorrelationId(createData);

  let pollAttempts = 0;
  const statusSnapshots: JsonRecord[] = [];

  if (!calculationId && correlationId) {
    const statusUrl =
      normalizeString(createData.statusUrl) ??
      buildAnalysisStatusUrl(endpointUrl, correlationId);

    for (let attempt = 1; attempt <= poll.maxAttempts; attempt++) {
      pollAttempts = attempt;
      const statusResponse = await performRequest({
        method: "GET",
        url: statusUrl,
        headers,
      });

      const statusData = asRecord(statusResponse.data);
      const status = normalizeStatus(statusData.status ?? statusData.state);
      calculationId = calculationId ?? extractCalculationId(statusData);

      statusSnapshots.push({
        attempt,
        statusCode: statusResponse.statusCode,
        status,
        calculationId,
      });

      if (calculationId && (isTerminalSuccessStatus(status) || status === "RUNNING")) {
        break;
      }

      if (isTerminalFailureStatus(status)) {
        break;
      }

      await sleep(poll.intervalMs);
    }
  }

  if (!calculationId) {
    return {
      success: false,
      stage: "poll",
      endpoint: endpointUrl,
      statusCode: createResponse.statusCode,
      error: "Unable to obtain calculationId from analysis-query workflow",
      create: {
        statusCode: createResponse.statusCode,
      },
      polling: {
        attempts: pollAttempts,
        snapshots: statusSnapshots,
      },
    };
  }

  const resultUrl =
    normalizeString(asRecord(createResponse.data).resultUrl) ??
    buildAnalysisResultUrl(endpointUrl, calculationId);

  const resultResponse = await performRequest({
    method: "GET",
    url: resultUrl,
    headers,
  });

  return {
    success: resultResponse.ok,
    workflowType: "analysis-query",
    endpoint: endpointUrl,
    statusCode: resultResponse.statusCode,
    create: {
      statusCode: createResponse.statusCode,
      correlationId,
      calculationId,
    },
    polling: {
      attempts: pollAttempts,
      snapshots: statusSnapshots,
    },
    result: summarizeAnalysisData(resultResponse.data),
  };
}

async function executeReportQueryWorkflow(
  route: LearnedRoute,
  endpointUrl: string,
  method: RequestSpec["method"],
  headers: Record<string, string>,
  body: unknown
): Promise<JsonRecord> {
  const poll = createPollConfig(route);
  const resultSelection = route.apiWorkflow?.resultSelection ?? "all-success";

  const createResponse = await performRequest({
    method,
    url: endpointUrl,
    headers,
    ...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
  });

  const createData = asRecord(createResponse.data);
  let latestStatus = createData;
  const reportCorrelationId = extractReportCorrelationId(createData);

  const pollingSnapshots: JsonRecord[] = [];
  let attempts = 0;

  if (reportCorrelationId) {
    const statusUrl =
      normalizeString(createData.statusUrl) ??
      buildReportStatusUrl(endpointUrl, reportCorrelationId);

    for (let attempt = 1; attempt <= poll.maxAttempts; attempt++) {
      attempts = attempt;
      const statusResponse = await performRequest({
        method: "GET",
        url: statusUrl,
        headers,
      });

      latestStatus = asRecord(statusResponse.data);
      const status = normalizeStatus(latestStatus.status);
      const states = Array.isArray(latestStatus.queryStates)
        ? latestStatus.queryStates.length
        : 0;

      pollingSnapshots.push({
        attempt,
        statusCode: statusResponse.statusCode,
        reportStatus: status,
        queryStates: states,
      });

      if (isTerminalSuccessStatus(status)) break;
      if (isTerminalFailureStatus(status)) break;

      await sleep(poll.intervalMs);
    }
  }

  const queryStates = Array.isArray(latestStatus.queryStates)
    ? latestStatus.queryStates
    : [];
  const calculationIds = pickCalculationIds(queryStates, resultSelection);

  if (calculationIds.length === 0) {
    return {
      success: false,
      workflowType: "report-query",
      stage: "result-selection",
      endpoint: endpointUrl,
      statusCode: createResponse.statusCode,
      error: "No successful calculation IDs returned by report-query workflow",
      report: {
        reportCorrelationId,
        reportStatus: normalizeStatus(latestStatus.status),
        queryStateCount: queryStates.length,
      },
      polling: {
        attempts,
        snapshots: pollingSnapshots,
      },
    };
  }

  const calculationResults: JsonRecord[] = [];

  for (const calculationId of calculationIds) {
    const resultUrl = buildAnalysisResultUrl(endpointUrl, calculationId);
    const resultResponse = await performRequest({
      method: "GET",
      url: resultUrl,
      headers,
    });

    calculationResults.push({
      calculationId,
      statusCode: resultResponse.statusCode,
      success: resultResponse.ok,
      summary: summarizeAnalysisData(resultResponse.data),
    });
  }

  const successCount = calculationResults.filter((item) => item.success === true).length;
  const totalRows = calculationResults.reduce((sum, item) => {
    const summary = asRecord(item.summary);
    const rowCount = summary.rowCount;
    return sum + (typeof rowCount === "number" ? rowCount : 0);
  }, 0);

  return {
    success: successCount > 0,
    workflowType: "report-query",
    endpoint: endpointUrl,
    statusCode: createResponse.statusCode,
    report: {
      reportCorrelationId,
      reportStatus: normalizeStatus(latestStatus.status),
      queryStateCount: queryStates.length,
      selectedCalculationCount: calculationIds.length,
      successfulResultCount: successCount,
      totalRows,
      selectionMode: resultSelection,
    },
    polling: {
      attempts,
      snapshots: pollingSnapshots,
    },
    calculations: calculationResults,
  };
}

// ── Plugin ──────────────────────────────────────────────────

export class ApiFetcherAgent extends BaseSubAgent {
  id = "api-fetcher";
  name = "API Fetcher";
  description =
    "Fetches data from previously learned API endpoints. " +
    "Uses routes defined in knowledge/learned-routes.json.";
  version = "1.0.0";
  capabilities = [
    "api-fetch",
    "learned-route-execution",
    "data-retrieval",
    "report-query-workflow",
  ];

  inputSchema = ApiFetcherInput;
  outputSchema = ApiFetcherOutput;
  private promptLoader: PromptLoader;
  private promptFile: string;

  constructor(options?: { promptLoader?: PromptLoader; promptFile?: string }) {
    super("openai:fast", ["anthropic:fast", "google:fast"], 3, 0.1);
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? API_FETCHER_SYSTEM_PROMPT_FILE;
  }

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

    const workflowType = route.apiWorkflow?.workflowType ?? "single-request";

    try {
      const resolvedUrl = resolveTemplateString(route.endpoint.url, params);
      const resolvedHeaders = resolveTemplateObject(route.endpoint.headers ?? {}, params);
      const resolvedQueryParams = resolveTemplateObject(
        route.endpoint.queryParams ?? {},
        params
      );

      const url = new URL(resolvedUrl);
      for (const [key, value] of Object.entries(resolvedQueryParams)) {
        if (value) url.searchParams.set(key, value);
      }

      const bodyInfo = createRequestBody(route, params);
      const preflight = buildMcpBuilderPreflight(route, workflowType, bodyInfo.source);

      logger.info(`api-fetcher: executing route "${routeId}"`, {
        url: url.toString(),
        method: route.endpoint.method,
        workflowType,
      });

      let workflowData: JsonRecord;

      if (workflowType === "analysis-query") {
        workflowData = await executeAnalysisQueryWorkflow(
          route,
          url.toString(),
          route.endpoint.method,
          resolvedHeaders,
          bodyInfo.body
        );
      } else if (workflowType === "report-query") {
        workflowData = await executeReportQueryWorkflow(
          route,
          url.toString(),
          route.endpoint.method,
          resolvedHeaders,
          bodyInfo.body
        );
      } else {
        workflowData = await executeSingleRequest(
          route,
          url.toString(),
          route.endpoint.method,
          resolvedHeaders,
          bodyInfo.body
        );
      }

      const success = workflowData.success === true;
      const output = {
        routeId,
        workflowType,
        fetchedAt: new Date().toISOString(),
        preflight,
        data: workflowData,
      };

      await learnedRoutesStore.incrementUsage(routeId, {
        agentId: this.id,
      });

      logger.info(`api-fetcher: route "${routeId}" completed`, {
        success,
        workflowType,
      });

      return {
        success,
        output: JSON.stringify(output),
        modelUsed: "api-fetcher (no model)",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`api-fetcher: fetch failed for route "${routeId}"`, {
        error: message,
      });

      const preflight = buildMcpBuilderPreflight(
        route,
        workflowType,
        normalizeString(route.apiWorkflow?.requestBodySource)
      );

      return {
        success: false,
        output: JSON.stringify({
          routeId,
          workflowType,
          preflight,
          error: `API workflow failed: ${message}`,
          recommendation:
            "Review preflight checks and route configuration. If this route is meant to be MCP-based, move it to mcp-fetcher routeType:sub-agent.",
        }),
        modelUsed: "none",
      };
    }
  }

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

// Testing helpers
export function __resetRuntimeMappTokenCache(): void {
  runtimeMappToken = null;
}
