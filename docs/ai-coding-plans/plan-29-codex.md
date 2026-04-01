# Codex Plan 29

1. Add deterministic learned-route input hydration for registered sub-agents in Agency execution, so `agentInputDefaults` are applied even when Cognition directly selects a registered agent.
2. Add defensive hydration in `mcp-fetcher` using `routeId` when required fields (`serverName`, `toolName`) are missing.
3. Tighten Cognition prompt hints for learned `sub-agent` routes to explicitly require `routeId` in subtask input.
4. Add unit tests for hydration behavior (Agency-side merge utility + MCP fallback hydration path).
5. Run tests, update `docs/HANDOVER.md`, commit, and push to `main`.
