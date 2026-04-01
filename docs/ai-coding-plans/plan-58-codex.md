# Codex Plan 58 — Move Learned Skills to `./.skills/learned`

Date: 2026-03-10
Status: Planned

## Goal
Separate static/manual skills from on-the-fly learned skills by storing all autonomous/generated skills under `./.skills/learned`.

## Implementation Steps
1. Update autonomous skill generation path rules:
   - `src/trigger/universal-skill-creator.ts` should materialize learned skills under `./.skills/learned`.
   - Enforce safe path normalization within that folder.

2. Update candidate defaults and persistence:
   - `src/routing/skill-candidates-schema.ts` default `suggestedSkillFile` -> `.skills/learned/new-agent-skill.md`.
   - `src/routing/skill-candidates-store.ts` fallback/defaults and matching summary remain consistent.

3. Update agency execute flow for suggestions:
   - Ensure persisted suggestion paths for autonomous skills resolve to `.skills/learned/*.md`.
   - Keep static references (`skills/universal-agent-skill-creator.md`, `skills/mcp-builder-SKILL.md`) unchanged.

4. Move existing learned files from `skills/` root to `.skills/learned/` if present:
   - `skills/baseline-consistency-validator.md`
   - `skills/cohort-comparison-consolidator.md`
   - `skills/mapp-intelligence-cohort-performance-report.md`
   - `skills/mapp-monthly-analysis-usage.md`

5. Update docs:
   - `docs/usage-guide.md` and `docs/HANDOVER.md` to document static vs learned skill locations.

6. Update tests and run full suite:
   - Adjust any path expectations from `skills/...` to `.skills/learned/...` for learned skills.
   - Run `npm test`.

## Acceptance
- New learned skills are written to `./.skills/learned` only.
- Static project skills remain in `./skills`.
- Existing learned files are moved under `./.skills/learned`.
- Tests pass and behavior remains deterministic.
