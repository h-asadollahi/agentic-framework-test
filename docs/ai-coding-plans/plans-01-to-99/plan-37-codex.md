# Codex Plan 37

1. Add grounding knowledge specs under `knowledge/agents/grounding/`:
   - `system-prompt.md` (runtime prompt source)
   - `decision-logic.md` (human-readable parse/fallback behavior mirror)
2. Add reusable runtime loader `src/tools/agent-spec-loader.ts` with:
   - `loadAgentPromptSpec(agentId, promptFile, fallback, vars?)`
   - markdown file loading from knowledge path
   - fallback on missing/empty file
   - placeholder interpolation via `{{KEY}}`
3. Refactor grounding agent prompt construction to load from knowledge runtime source while preserving behavior/output contract.
4. Add tests:
   - unit tests for loader success/interpolation/fallback
   - grounding-agent test to verify runtime file loading and fallback behavior
5. Update docs:
   - add short usage-guide section for agent specs in `knowledge/agents/...`
   - update `docs/HANDOVER.md` with completion and next step note.
6. Run test suite, then commit and push only relevant files.
