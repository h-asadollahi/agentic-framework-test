# Codex Plan 09 — MCP-Backed Learned Routes

Date: 2026-03-06
Status: Completed

1. Implement MCP fetcher sub-agent
- Add a new plugin `mcp-fetcher` under `src/trigger/sub-agents/plugins/`.
- Input shape includes MCP server name, tool name, and mapped tool arguments.
- Execute by calling MCP tools through existing `MCPClientManager`.

2. Register plugin and keep routing model stable
- Register `mcp-fetcher` in plugin index.
- Continue using current learned-route target model (`routeType: "sub-agent"`).

3. Add learned-routes examples for MCP usage
- Add route entries in `knowledge/learned-routes.json` that target `agentId: "mcp-fetcher"` with `agentInputDefaults` for server/tool.

4. Tests + docs
- Add focused unit tests for input mapping helpers used by `mcp-fetcher`.
- Update `docs/HANDOVER.md` and `docs/usage-guide.md` with MCP-route instructions.

5. Validate and persist
- Run `npm test` and `npx tsc --noEmit`.
- Mark plan completed, commit, and push to `main`.
