# codex-plan-78

Status: Implemented (2026-03-16)

1. Switch sub-agent defaults from Anthropic-first to OpenAI-first:
   - Update `BaseSubAgent` default constructor model order.
   - Update plugin constructors (`cohort-monitor`, `api-fetcher`, `mcp-fetcher`) to `openai:fast` preferred with Anthropic/Google fallbacks.
2. Keep behavior unchanged otherwise (no routing/logic changes).
3. Run focused tests for sub-agents and execute flow.
4. Update `docs/HANDOVER.md` with this model-priority change.
5. Commit and push to `main`.

## Result

- OpenAI-first default model order applied to sub-agents.
- Updated files:
  - `src/trigger/sub-agents/base-sub-agent.ts`
  - `src/trigger/sub-agents/plugins/cohort-monitor.ts`
  - `src/trigger/sub-agents/plugins/api-fetcher.ts`
  - `src/trigger/sub-agents/plugins/mcp-fetcher.ts`
- Focused tests passed: `15/15`.
