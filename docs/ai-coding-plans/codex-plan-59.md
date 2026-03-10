# Codex Plan 59 — Move On-the-Fly Learned Skills to `./skills/learned`

Date: 2026-03-10
Status: Implemented

## Goal
Store all autonomous/on-the-fly learned skills under `./skills/learned` so they are clearly separated from static project skills in `./skills`.

## Implementation Steps
1. Update autonomous skill path normalization
- File: `src/trigger/universal-skill-creator.ts`
- Change fallback and path sanitization so learned skills are materialized under `skills/learned/*.md`.
- Keep static skill references unchanged (e.g., `skills/universal-agent-skill-creator.md`, `skills/mcp-builder-SKILL.md`).

2. Update skill candidate defaults
- File: `src/routing/skill-candidates-schema.ts`
- Change default `suggestedSkillFile` to `skills/learned/new-agent-skill.md`.

3. Move existing learned skill files
- Move current autonomous files from `skills/*.md` to `skills/learned/*.md`.
- Update `knowledge/skill-candidates.json` paths accordingly.

4. Update execution and test expectations
- Update unit tests that assert autonomous skill file paths (`tests/unit/autonomous-skill-loop.test.ts`, `tests/unit/agency-skill-suggestions.test.ts`, and related fixtures/assertions).

5. Documentation updates
- Update `docs/usage-guide.md` to document static vs learned skill locations.
- Update `docs/HANDOVER.md` with the migration status and impact.

6. Validation
- Run targeted tests for skill lifecycle and path behavior.
- Run full test suite if targeted tests pass.

## Acceptance Criteria
- New autonomous skill files are only created in `./skills/learned`.
- Existing autonomous files are under `./skills/learned`.
- Static/manual project skills remain in `./skills` root.
- Tests pass and pipeline behavior remains unchanged.
