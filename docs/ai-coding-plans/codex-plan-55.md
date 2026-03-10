# Codex Plan 55 — Agency-to-Cognition Skill Feedback Loop

## Summary
Implement a persistent feedback loop so reusable-skill recommendations produced by the Agency stage are stored, surfaced to Cognition on future prompts, and can deterministically trigger the universal skill-creator workflow.

## Steps
1. Extend agency result schema for structured skill recommendations:
- Add `skillSuggestions` to agency output contract in core types.
- Update Agency knowledge prompt to require structured `skillSuggestions` objects.

2. Add persistent skill candidate store:
- New `knowledge/skill-candidates.json` as human-readable source.
- New store under `src/routing/skill-candidates-store.ts` with load/save/upsert/summary.
- Deduplicate by capability and suggested skill file.

3. Persist Agency suggestions during execute stage:
- Parse `skillSuggestions` from agency summary payload.
- Normalize and save suggestions to skill-candidates store.
- Add explicit issue note if suggestion parsing fails.

4. Feed candidates into Cognition prompt:
- Inject `SKILL_CANDIDATES_SECTION` in cognition system prompt build.
- Add policy in `knowledge/agents/cognition/system-prompt.md` to reuse candidates and assign `agentId: "skill-creator"` when user requests automation/skill creation.
- Update cognition decision logic doc to reflect this feedback mechanism.

5. Deterministic skill-creator routing:
- In execute stage, if subtask agent is `skill-creator` (or alias), run universal skill creator workflow directly.
- Keep existing keyword-based detection as fallback.

6. Tests and docs:
- Add unit tests for skill-candidate store and normalization/upsert behavior.
- Add cognition prompt test to verify skill candidate injection.
- Update `docs/usage-guide.md` with prompts for validating the feedback loop.
- Update `docs/HANDOVER.md` with completion notes.

## Acceptance Criteria
- Agency structured skill suggestions are persisted to `knowledge/skill-candidates.json`.
- Cognition prompt includes saved skill candidates on subsequent runs.
- A user request to create/automate a repeated workflow can route to `skill-creator` deterministically.
- Tests cover persistence + prompt injection behavior.
