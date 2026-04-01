# codex-plan-70

1. Remove all learned skill files from `skills/learned/`.
2. Reset `knowledge/skill-candidates.json` to an empty candidates list while preserving schema (`version`, `lastUpdated`, `candidates`).
3. Update `docs/HANDOVER.md` with the cleanup operation and rationale.
4. Run focused tests to confirm no regressions in skill-candidate and autonomous-skill logic.
