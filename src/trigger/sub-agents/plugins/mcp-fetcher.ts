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
    const parsed = McpFetcherInput.safeParse(input);
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

      const data = await tool.execute(toolArgs);

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
