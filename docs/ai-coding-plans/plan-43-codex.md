# Codex Plan 43

1. Add `api-fetcher` sub-agent specs under `knowledge/sub-agents/api-fetcher/`:
   - `system-prompt.md`
   - `decision-logic.md`
2. Refactor `src/trigger/sub-agents/plugins/api-fetcher.ts` to load prompt from knowledge specs via `loadAgentPromptSpec()` with placeholder interpolation and fallback.
3. Keep runtime-authoritative API fetch execution logic unchanged; document behavior in decision logic markdown.
4. Add tests:
   - `tests/unit/api-fetcher-sub-agent.test.ts` for prompt loading + fallback interpolation + execution sanity on invalid input path.
5. Update docs:
   - extend `docs/usage-guide.md` to include `api-fetcher` sub-agent knowledge spec files.
   - update `docs/HANDOVER.md` with Plan 43 completion and next planned sub-agent (`mcp-fetcher`).
6. Run full unit test suite, then commit/push only related files.
