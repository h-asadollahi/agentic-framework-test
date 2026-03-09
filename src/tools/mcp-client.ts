import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
import { logger } from "../core/logger.js";

/**
 * MCP Client Manager
 *
 * Manages Model Context Protocol connections to external tool servers.
 * Each MCP server provides tools that agents can call during execution.
 *
 * Usage:
 *   const tools = await mcpManager.getTools("server-name");
 *   // Pass tools to agent's getTools() method
 *
 * Configuration:
 *   MCP servers are defined in MCP_SERVERS env var as JSON, or via
 *   the addServer() method.
 */

interface MCPStdioServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPHttpServerConfig {
  name: string;
  transport: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

type MCPServerConfig = MCPStdioServerConfig | MCPHttpServerConfig;

class MCPClientManager {
  private clients: Map<string, Awaited<ReturnType<typeof createMCPClient>>> =
    new Map();
  private configs: Map<string, MCPServerConfig> = new Map();

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    const serversJson = process.env.MCP_SERVERS;
    if (serversJson) {
      try {
        const servers: MCPServerConfig[] = JSON.parse(serversJson);
        for (const server of servers) {
          this.configs.set(server.name, server);
        }
        logger.info(`Loaded ${servers.length} MCP server config(s) from env`);
      } catch (error) {
        logger.warn("Failed to parse MCP_SERVERS env var", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.loadMappMichelServerFromEnv();
  }

  /**
   * Auto-register the hosted MAPP MCP server used by learned routes.
   * This avoids requiring a JSON-encoded MCP_SERVERS entry for the common case.
   */
  private loadMappMichelServerFromEnv(): void {
    const url = process.env.MAPP_MCP_SERVER_MICHEL_URL?.trim();
    const token = process.env.MAPP_MCP_SERVER_MICHEL_TOKEN?.trim();

    if (!url || !token) return;

    if (this.configs.has("mapp-michel")) {
      return;
    }

    this.configs.set("mapp-michel", {
      name: "mapp-michel",
      transport: "http",
      url: url.replace(/\/$/, "") + "/api/mcp",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
      },
    });

    logger.info('Loaded MCP server config "mapp-michel" from env');
  }

  /**
   * Add an MCP server configuration.
   */
  addServer(config: MCPServerConfig): void {
    this.configs.set(config.name, config);
  }

  /**
   * Connect to an MCP server and return its tools.
   * Caches the connection for reuse.
   */
  async getTools(serverName: string): Promise<Record<string, Tool>> {
    // Return cached client's tools if already connected
    if (this.clients.has(serverName)) {
      const client = this.clients.get(serverName)!;
      return (await client.tools()) as Record<string, Tool>;
    }

    const config = this.configs.get(serverName);
    if (!config) {
      logger.warn(`MCP server "${serverName}" not configured`, {
        configuredServers: this.listServers(),
      });
      return {};
    }

    try {
      const client =
        "command" in config
          ? await createMCPClient({
              transport: new StdioMCPTransport({
                command: config.command,
                args: config.args,
                env: config.env,
              }),
            })
          : await createMCPClient({
              transport: {
                type: config.transport,
                url: config.url,
                headers: config.headers,
              },
            });

      this.clients.set(serverName, client);

      const tools = (await client.tools()) as Record<string, Tool>;
      logger.info(`Connected to MCP server "${serverName}"`, {
        toolCount: Object.keys(tools).length,
        tools: Object.keys(tools),
      });

      return tools;
    } catch (error) {
      logger.error(`Failed to connect to MCP server "${serverName}"`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Get tools from all configured servers.
   */
  async getAllTools(): Promise<Record<string, Tool>> {
    const allTools: Record<string, Tool> = {};

    for (const name of this.configs.keys()) {
      const tools = await this.getTools(name);
      Object.assign(allTools, tools);
    }

    return allTools;
  }

  /**
   * Close all MCP connections.
   */
  async closeAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info(`Closed MCP connection: ${name}`);
      } catch (error) {
        logger.warn(`Error closing MCP connection "${name}"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.clients.clear();
  }

  /**
   * List configured server names.
   */
  listServers(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Check if a server is connected.
   */
  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }
}

export const mcpManager = new MCPClientManager();
