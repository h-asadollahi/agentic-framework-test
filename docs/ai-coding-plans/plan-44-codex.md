# Codex Plan 44

1. Add `mcp-fetcher` sub-agent specs under `knowledge/sub-agents/mcp-fetcher/`:
   - `system-prompt.md`
   - `decision-logic.md`
2. Refactor `src/trigger/sub-agents/plugins/mcp-fetcher.ts` to load prompt from knowledge specs via `loadAgentPromptSpec()` with placeholder interpolation and fallback.
3. Keep runtime-authoritative MCP execution logic unchanged; document behavior in decision logic markdown.
4. Add tests:
   - `tests/unit/mcp-fetcher-sub-agent.test.ts` for prompt loading + fallback interpolation + deterministic invalid-input execution path.
5. Update docs:
   - extend `docs/usage-guide.md` to include `mcp-fetcher` sub-agent knowledge spec files.
   - update `docs/HANDOVER.md` with Plan 44 completion and close out current sub-agent migration batch.
6. Run full unit test suite, then commit/push only related files.
