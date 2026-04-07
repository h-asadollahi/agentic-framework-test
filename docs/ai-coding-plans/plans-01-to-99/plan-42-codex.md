# Codex Plan 42

1. Add first sub-agent knowledge specs under `knowledge/sub-agents/cohort-monitor/`:
   - `system-prompt.md` as runtime prompt source
   - `decision-logic.md` documenting current mock-first execution and AI-mode fallback behavior
2. Refactor `src/trigger/sub-agents/plugins/cohort-monitor.ts` to load prompt from `knowledge/sub-agents/cohort-monitor/system-prompt.md` using `loadAgentPromptSpec()` with placeholder interpolation and hardcoded fallback.
3. Keep `execute()` mock-data path runtime-authoritative; document this explicitly in decision logic doc.
4. Add tests:
   - `tests/unit/cohort-monitor-sub-agent.test.ts` for prompt loading + fallback interpolation + mock execute sanity path.
5. Update docs:
   - extend `docs/usage-guide.md` to include `knowledge/sub-agents/...` pattern and cohort-monitor files
   - update `docs/HANDOVER.md` with Plan 42 completion and next sub-agent target (`api-fetcher`)
6. Run full unit test suite and commit/push only relevant files.
