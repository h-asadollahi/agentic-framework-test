# Codex Plan 13 — Add MAPP MCP Learned Routes for Key Questions

Date: 2026-03-09
Status: Completed

1. Discover MCP tool mapping
- Query the configured MAPP MCP server and list available tools/descriptions.
- Map each requested marketer question to a concrete MCP tool + default args.

2. Update `knowledge/learned-routes.json`
- Add/adjust learned routes as `routeType: "sub-agent"` with `agentId: "mcp-fetcher"`.
- Configure `agentInputDefaults` with server/tool/args templates for:
  - dimensions + metrics list
  - page impressions (last 7 days intent)
  - defined segments
  - monthly API calculations usage

3. Validate and document
- Validate JSON format and route IDs consistency.
- Update `docs/HANDOVER.md` with new MCP route coverage.

4. Persist
- Mark this plan completed.
- Commit and push to `main`.
