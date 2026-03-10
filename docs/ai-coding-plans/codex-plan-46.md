# Codex Plan 46 — Grounding JSON Parse Robustness

## Summary
Fix Trigger warning `Grounding agent output wasn't valid JSON, using parsed context` by replacing strict JSON parsing in grounding stage with the shared tolerant parser used by cognition/interface.

## Steps
1. Refactor `src/trigger/ground.ts` to use `parseAgentJson` for grounding output.
2. Preserve safe fallback behavior to deterministic context when parsing fails.
3. Add unit tests for grounding parse behavior:
- plain JSON payload
- fenced/embedded JSON payload
- non-JSON fallback path
4. Run focused tests and full regression suite.
5. Update `docs/HANDOVER.md` with fix details.
6. Commit and push changes to `main`.

## Acceptance Criteria
- Grounding accepts JSON returned as plain, fenced, or embedded object.
- Warning only appears when output is truly non-JSON.
- Existing grounding output contract remains unchanged.
- All tests pass.
