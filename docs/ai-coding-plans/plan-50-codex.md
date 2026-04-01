# Codex Plan 50 — Reorder Agent Model Priority to OpenAI → Claude → Gemini

## Summary
Change agent model priority so all agent chains prefer OpenAI first, then Anthropic (Claude), then Google (Gemini).

## Scope
1. Update `.env` agent model assignment order (`AGENT_*_MODELS`) to:
- OpenAI first
- Anthropic second
- Google third

2. Update `.env.example` to match the same order for future setups.

3. Update default fallback order in `src/config/models.ts` so behavior is still correct even when env vars are missing.

4. Keep model aliases unchanged (`MODEL_OPENAI_*`, `MODEL_ANTHROPIC_*`, `MODEL_GOOGLE_*`) unless you ask to switch specific model IDs.

5. Validation:
- run tests
- quick runtime check that `getModelAssignment()` resolves OpenAI as preferred for all configured agents.

6. Documentation/handover:
- update `docs/HANDOVER.md` with the priority change.

7. Commit + push to `main`.

## Proposed Agent Orders
- `AGENT_ORCHESTRATOR_MODELS=openai:balanced,anthropic:powerful,google:balanced`
- `AGENT_GROUNDING_MODELS=openai:fast,anthropic:fast,google:fast`
- `AGENT_COGNITION_MODELS=openai:reasoning,anthropic:balanced,google:balanced`
- `AGENT_AGENCY_MODELS=openai:balanced,anthropic:balanced,google:balanced`
- `AGENT_INTERFACE_MODELS=openai:fast,anthropic:fast,google:fast`
- `AGENT_NOTIFICATION_MANAGER_MODELS=openai:fast,anthropic:fast,google:fast`

## Acceptance Criteria
- All agent assignments prefer OpenAI first in `.env` and `.env.example`.
- Defaults in `src/config/models.ts` also prefer OpenAI first.
- Tests pass and no behavioral regressions.
