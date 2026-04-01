# Codex Plan 48 — Stop Route-Learning Loops for MCP Builder Prompts

## Summary
Fix endless/long-running route-learning behavior for prompts like:
`Create an MCP server for our internal CRM API so agents can fetch customer lifecycle data.`

## Steps
1. Prioritize deterministic special workflows in Agency execution:
- in `src/trigger/execute.ts`, evaluate `isMcpBuilderIntent()` and `isUniversalSkillCreationIntent()` before learned-route lookup/route-learning logic.
- this ensures MCP-builder prompts cannot be hijacked by learned routes or route-learning loops.

2. Refine unknown-subtask route-learning heuristic:
- in `src/trigger/execute-routing.ts`, prevent `learn-new-route` for build/integration/implementation tasks.
- keep route-learning for true data-fetch intents.

3. Expand MCP intent detection coverage:
- in `src/trigger/mcp-builder.ts`, add keywords for CRM/customer lifecycle integration phrasing.

4. Add tests:
- `tests/unit/execute-routing.test.ts`: build/integration prompts should not trigger route-learning.
- `tests/unit/mcp-builder.test.ts`: exact CRM lifecycle prompt should match MCP-builder intent.

5. Validation:
- run focused tests + full suite.

6. Docs/handover:
- update `docs/HANDOVER.md` with bug + fix summary.

7. Commit + push to `main`.

## Acceptance Criteria
- MCP builder prompt no longer waits in Slack route-learning loop.
- Routing selects MCP-builder guidance path deterministically.
- No regressions in existing tests.
