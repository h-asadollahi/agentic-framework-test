import { z } from "zod";
import { type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext, AgentResult } from "../../../core/types.js";
import { mcpManager } from "../../../tools/mcp-client.js";
import { learnedRoutesStore } from "../../../routing/learned-routes-store.js";
import { logger } from "../../../core/logger.js";

type JsonRecord = Record<string, unknown>;

type ExecutableTool = Tool & {
  execute?: (input: unknown) => Promise<unknown>;
};

const McpFetcherInput = z
  .object({
    serverName: z.string().min(1).describe("Configured MCP server name"),
    toolName: z.string().min(1).describe("Tool to execute from that server"),
    args: z
      .record(z.unknown())
      .optional()
      .default({})
      .describe("Static/default tool args; supports {{input.key}} templates"),
    params: z
      .record(z.unknown())
      .optional()
      .default({})
      .describe("Runtime args from subtask input"),
    routeId: z.string().optional().describe("Optional learned-route id"),
    description: z.string().optional(),
  })
  .passthrough();

const McpFetcherOutput = z.object({
  serverName: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  data: z.unknown(),
  executedAt: z.string(),
});

const MAX_OUTPUT_CHARS = 80_000;

function asRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return null;
}

export function hydrateMcpInputFromLearnedRoute(input: unknown): unknown {
  const inputRecord = asRecord(input);
  if (!inputRecord) return input;

  const hasServerName =
    typeof inputRecord.serverName === "string" &&
    inputRecord.serverName.trim().length > 0;
  const hasToolName =
    typeof inputRecord.toolName === "string" &&
    inputRecord.toolName.trim().length > 0;
  if (hasServerName && hasToolName) return input;

  const routeId =
    typeof inputRecord.routeId === "string" && inputRecord.routeId.trim().length > 0
      ? inputRecord.routeId
      : null;
  if (!routeId) return input;

  const route = learnedRoutesStore.getById(routeId);
  if (!route || route.routeType !== "sub-agent" || route.agentId !== "mcp-fetcher") {
    return input;
  }

  const defaults = asRecord(route.agentInputDefaults) ?? {};
  const merged: JsonRecord = {
    ...defaults,
    ...inputRecord,
  };

  const defaultArgs = asRecord(defaults.args) ?? {};
  const inputArgs = asRecord(inputRecord.args) ?? {};
  if (Object.keys(defaultArgs).length > 0 || Object.keys(inputArgs).length > 0) {
    merged.args = {
      ...defaultArgs,
      ...inputArgs,
    };
  }

  return merged;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function extractDimensionMetricNames(data: unknown): {
  dimensions: string[];
  metrics: string[];
} | null {
  const direct = asRecord(data);
  if (direct) {
    const dimensions = asStringArray(
      Array.isArray(direct.dimensions)
        ? (direct.dimensions as unknown[]).map((d) =>
            asRecord(d)?.name ?? null
          )
        : []
    );
    const metrics = asStringArray(
      Array.isArray(direct.metrics)
        ? (direct.metrics as unknown[]).map((m) => asRecord(m)?.name ?? null)
        : []
    );

    if (dimensions.length > 0 || metrics.length > 0) {
      return { dimensions, metrics };
    }

    const content = direct.content;
    if (Array.isArray(content)) {
      const first = asRecord(content[0]);
      const text = typeof first?.text === "string" ? first.text : "";
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const parsedRecord = asRecord(parsed);
          if (!parsedRecord) return null;
          const parsedDimensions = asStringArray(
            Array.isArray(parsedRecord.dimensions)
              ? (parsedRecord.dimensions as unknown[]).map((d) =>
                  asRecord(d)?.name ?? null
                )
              : []
          );
          const parsedMetrics = asStringArray(
            Array.isArray(parsedRecord.metrics)
              ? (parsedRecord.metrics as unknown[]).map((m) =>
                  asRecord(m)?.name ?? null
                )
              : []
          );
          if (parsedDimensions.length > 0 || parsedMetrics.length > 0) {
            return { dimensions: parsedDimensions, metrics: parsedMetrics };
          }
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function shapeMcpOutputData(toolName: string, data: unknown): unknown {
  if (toolName === "list_dimensions_and_metrics") {
    const names = extractDimensionMetricNames(data);
    if (names) {
      return {
        compacted: true,
        compactedFor: toolName,
        dimensionsCount: names.dimensions.length,
        metricsCount: names.metrics.length,
        dimensions: names.dimensions,
        metrics: names.metrics,
      };
    }
  }

  const serialized = JSON.stringify(data);
  if (serialized.length <= MAX_OUTPUT_CHARS) {
    return data;
  }

  return {
    compacted: true,
    originalSizeChars: serialized.length,
    preview: serialized.slice(0, 12_000),
    note:
      "MCP output was truncated to keep pipeline payload below task storage limits.",
  };
}

export function resolveMcpTemplateValue(
  value: unknown,
  params: JsonRecord
): unknown {
  if (typeof value === "string") {
    const exactInputMatch = value.match(/^\{\{input\.(\w+)\}\}$/);
    if (exactInputMatch) {
      return params[exactInputMatch[1]];
    }

    return value
      .replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, envVar: string) => {
        return process.env[envVar] ?? "";
      })
      .replace(/\{\{input\.(\w+)\}\}/g, (_, key: string) => {
        return String(params[key] ?? "");
      });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveMcpTemplateValue(item, params));
  }

  if (value && typeof value === "object") {
    const obj = value as JsonRecord;
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveMcpTemplateValue(v, params)])
    );
  }

  return value;
}

export function buildMcpToolArgs(
  defaults: JsonRecord,
  runtimeParams: JsonRecord
): JsonRecord {
  const resolvedDefaults = resolveMcpTemplateValue(defaults, runtimeParams);
  const defaultObj =
    resolvedDefaults && typeof resolvedDefaults === "object"
      ? (resolvedDefaults as JsonRecord)
      : {};
  return {
    ...defaultObj,
    ...runtimeParams,
  };
}

export class McpFetcherAgent extends BaseSubAgent {
  id = "mcp-fetcher";
  name = "MCP Fetcher";
  description =
    "Executes a configured MCP tool using learned-route defaults and runtime input.";
  version = "1.0.0";
  capabilities = ["mcp", "learned-route-execution", "tool-calling"];

  inputSchema = McpFetcherInput;
  outputSchema = McpFetcherOutput;

  constructor() {
    super("anthropic:fast", ["openai:fast", "google:fast"], 3, 0.1);
  }

  async execute(input: unknown, _context: ExecutionContext): Promise<AgentResult> {
    const hydratedInput = hydrateMcpInputFromLearnedRoute(input);
    const parsed = McpFetcherInput.safeParse(hydratedInput);
    if (!parsed.success) {
      return {
        success: false,
        output: JSON.stringify({
          error: "Invalid input for mcp-fetcher",
          details: parsed.error.flatten(),
        }),
        modelUsed: "none",
      };
    }

    const { serverName, toolName, args, params, routeId } = parsed.data;

    try {
      const tools = await mcpManager.getTools(serverName);
      const tool = tools[toolName] as ExecutableTool | undefined;

      if (!tool) {
        return {
          success: false,
          output: JSON.stringify({
            error: `MCP tool "${toolName}" was not found on server "${serverName}"`,
            availableTools: Object.keys(tools),
          }),
          modelUsed: "none",
        };
      }

      if (typeof tool.execute !== "function") {
        return {
          success: false,
          output: JSON.stringify({
            error: `MCP tool "${toolName}" is not executable`,
          }),
          modelUsed: "none",
        };
      }

      const toolArgs = buildMcpToolArgs(args, params);
      logger.info(`mcp-fetcher: executing ${serverName}.${toolName}`, {
        routeId,
        argKeys: Object.keys(toolArgs),
      });

      const rawData = await tool.execute(toolArgs);
      const data = shapeMcpOutputData(toolName, rawData);

      if (routeId) {
        learnedRoutesStore.incrementUsage(routeId);
      }

      const output = {
        serverName,
        toolName,
        args: toolArgs,
        data,
        executedAt: new Date().toISOString(),
      };

      return {
        success: true,
        output: JSON.stringify(output),
        modelUsed: "mcp-fetcher (no model)",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`mcp-fetcher: execution failed for ${serverName}.${toolName}`, {
        error: message,
      });
      return {
        success: false,
        output: JSON.stringify({
          serverName,
          toolName,
          routeId,
          error: `MCP tool execution failed: ${message}`,
        }),
        modelUsed: "none",
      };
    }
  }

  getSystemPrompt(_context: ExecutionContext): string {
    return "You are the MCP Fetcher sub-agent.";
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return {};
  }
}

import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new McpFetcherAgent());
