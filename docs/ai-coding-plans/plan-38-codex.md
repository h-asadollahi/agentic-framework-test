# Codex Plan 38

1. Add Cognition knowledge specs under `knowledge/agents/cognition/`:
   - `system-prompt.md` as the runtime prompt source
   - `decision-logic.md` documenting parse fallback and deterministic rejection policy
2. Refactor `src/agents/cognition-agent.ts` to load its system prompt from `knowledge/agents/cognition/system-prompt.md` using `loadAgentPromptSpec()` with placeholder vars and hardcoded fallback.
3. Keep `src/trigger/think.ts` and `src/trigger/cognition-guardrails.ts` runtime-authoritative while mirroring behavior in `decision-logic.md`.
4. Add tests:
   - `tests/unit/cognition-agent.test.ts` for runtime prompt loading + fallback
   - extend/adjust loader behavior if needed for fallback interpolation
5. Update docs:
   - add Cognition entries to `docs/usage-guide.md` section “Agent Specs in Knowledge”
   - append completion status to `docs/HANDOVER.md` and note next phase (Agency)
6. Run full test suite, then commit and push only relevant files.
