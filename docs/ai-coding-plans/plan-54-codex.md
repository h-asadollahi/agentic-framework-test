# Codex Plan 54 — Deterministic MCP-First Routing Enforcement

## Summary
Ensure requests that match learned routes targeting MCP sub-agents always execute MCP tools, even if Cognition emits a conflicting registered agent (e.g., `api-fetcher`). Keep human-readable cognition guidance aligned under `knowledge/agents/cognition`.

## Steps
1. Add deterministic route-target enforcement in `src/trigger/execute.ts`:
- For subtasks whose `agentId` is already a registered sub-agent, resolve learned route by `routeId` (if present) or by capability match.
- If learned route is `routeType: "sub-agent"` with a registered `agentId`, execute that route agent (source of truth), not the originally emitted `subtask.agentId`.
- Preserve existing hydration behavior for matching agent IDs.

2. Keep API fetcher usage strictly route-type bound:
- `api-fetcher` executes only when matched learned route is `routeType: "api"`.
- Do not remap a `sub-agent` route to API execution.

3. Update cognition human-readable specs in `knowledge/agents/cognition`:
- `system-prompt.md`: explicitly prefer learned route target assignment, and when route target is `sub-agent:mcp-fetcher`, assign `mcp-fetcher`.
- `decision-logic.md`: document execution-stage deterministic override as safety net.

4. Add tests for enforcement behavior:
- New focused unit tests for route target resolution/override helper behavior.
- Cover:
  - conflicting registered agent overridden to learned sub-agent target
  - matching registered agent remains unchanged
  - api routes remain api-targeted
  - unknown/non-sub-agent cases remain unchanged

5. Run targeted unit tests and update handover:
- Execute new + related tests.
- Update `docs/HANDOVER.md` with bug root cause and implemented fix.

## Acceptance Criteria
- Prompt `"What segments are defined in my Mapp Intelligence account?"` cannot execute via `api-fetcher` when matched learned route target is `sub-agent:mcp-fetcher`.
- Execution logs show deterministic route-target override when Cognition emits conflicting registered `agentId`.
- Cognition human-readable knowledge docs reflect MCP-first policy.
- Tests cover and protect this behavior.
