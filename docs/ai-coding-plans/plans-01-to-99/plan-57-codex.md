# Codex Plan 57 — Autonomous Skill Self-Learning (No HITL for Skills)

Date: 2026-03-10
Status: Implemented

## Goal
Replace passive `skill-candidates` suggestion storage with an autonomous loop where the system creates skill files automatically and reuses them for similar future prompts, without human-review gates for this skill lifecycle.

## Scope
1. Auto-materialize skills from Agency suggestions using `skills/universal-agent-skill-creator.md`.
2. Make Cognition/think stage automatically trigger skill creation when a prompt matches a candidate whose skill file is missing.
3. Remove skill-approval gating in candidate persistence (`requiresApproval` false by default for this loop).
4. Keep existing route execution behavior unchanged (MCP/API routing remains as-is).

## Implementation Steps
1. Extend universal skill creator helper to actually write skills under `./skills`:
   - Normalize/validate destination path under `skills/`.
   - Generate deterministic markdown using candidate metadata + universal skill creator structure.
   - Return materialization metadata (`created/updated/unchanged`, path).

2. Wire autonomous materialization in Agency execution:
   - After parsing `skillSuggestions`, upsert candidates with `requiresApproval: false`.
   - Materialize skill files immediately for each valid suggestion.
   - Persist non-fatal issues to `agencyResult.issues` if materialization fails.

3. Add deterministic cognition adaptation in `pipeline-think`:
   - Match prompt against persisted candidate trigger patterns.
   - If best candidate matches and skill file does not exist, prepend a `skill-creator` subtask automatically.
   - Add reasoning note showing autonomous self-learning action.

4. Improve candidate store utilities:
   - Add prompt matching helper with deterministic scoring.
   - Expose materialization signal in summary (`materialized` boolean).
   - Default `requiresApproval` to `false` for new candidates.

5. Update human-readable knowledge docs and usage guide:
   - Cognition prompt/decision logic to reflect autonomous skill creation and no skill HITL.
   - Usage guide section with prompts that validate the self-learning loop.
   - HANDOVER update with final behavior notes.

6. Add tests:
   - Universal skill creator materializes files.
   - Execute stage auto-materializes from `skillSuggestions`.
   - Think stage prepends autonomous `skill-creator` task for matched-but-missing skill files.
   - Candidate-store prompt matching + `materialized` summary flag.

## Acceptance Criteria
- New skill suggestions produce real files in `./skills` automatically.
- Similar future prompts trigger deterministic self-learning behavior without human-review requirement for skills.
- Existing pipeline tests pass with new autonomous behavior.
