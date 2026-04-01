# Codex Plan 39

1. Add Agency knowledge specs under `knowledge/agents/agency/`:
   - `system-prompt.md` as runtime prompt source
   - `decision-logic.md` documenting Agency-stage orchestration/summary fallback behavior
2. Refactor `src/agents/agency-agent.ts` to load its system prompt from `knowledge/agents/agency/system-prompt.md` via `loadAgentPromptSpec()` with placeholder interpolation and hardcoded fallback.
3. Keep `src/trigger/execute.ts` as runtime-authoritative for subtask orchestration and summary parse fallback while mirroring behavior in agency `decision-logic.md`.
4. Add tests:
   - `tests/unit/agency-agent.test.ts` for runtime prompt loading + fallback interpolation.
5. Update docs:
   - expand `docs/usage-guide.md` section “Agent Specs in Knowledge” with Agency entries
   - update `docs/HANDOVER.md` with Plan 39 completion and next phase (Interface)
6. Run full test suite and then commit/push only relevant files.
