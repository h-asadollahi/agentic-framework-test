# Codex Plan 45 — Fix Agent Prompt Path Resolution in Trigger Runtime

## Summary
Fix post-migration warnings where agents fail to read `knowledge/...` prompt files in Trigger runtime and fall back to hardcoded prompts due to incorrect root resolution under `.trigger`.

## Key Changes
1. Refactor `src/tools/agent-spec-loader.ts` project-root resolution:
- discover root by traversing for `package.json` + `knowledge`
- search from `process.cwd()` first, then module directory fallback
- keep final fallback to relative `../..`

2. Keep all prompt interfaces unchanged:
- `loadAgentPromptSpec(agentId, promptFile, fallback, vars)` contract remains the same
- no changes to agent/sub-agent output schemas

3. Add regression coverage:
- `tests/unit/agent-spec-loader.test.ts`
- new case simulating `.trigger`-style external cwd and ensuring knowledge prompt still loads

## Acceptance Criteria
- No runtime warnings for missing prompt files when files exist in `knowledge/...`
- Trigger execution resolves prompt files from repository root, not `.trigger/...`
- Existing agent/sub-agent prompt-loader tests continue to pass
