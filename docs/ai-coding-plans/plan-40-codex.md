# Codex Plan 40

1. Add Interface knowledge specs under `knowledge/agents/interface/`:
   - `system-prompt.md` as runtime prompt source
   - `decision-logic.md` documenting delivery formatting and notification decision flow
2. Refactor `src/agents/interface-agent.ts` to load its system prompt from `knowledge/agents/interface/system-prompt.md` via `loadAgentPromptSpec()` with placeholder interpolation and hardcoded fallback.
3. Keep `src/trigger/deliver.ts` and `src/trigger/deliver-notifications.ts` runtime-authoritative while mirroring behavior in `knowledge/agents/interface/decision-logic.md`.
4. Add tests:
   - `tests/unit/interface-agent.test.ts` for runtime prompt loading + fallback interpolation.
5. Update docs:
   - expand `docs/usage-guide.md` section “Agent Specs in Knowledge” with Interface entries
   - update `docs/HANDOVER.md` with Plan 40 completion and next phase (sub-agents)
6. Run full test suite and then commit/push only relevant files.
