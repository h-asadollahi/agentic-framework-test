# Codex Plan 51 — Use `MODEL_OPENAI_POWERFUL` for Main Orchestrator

## Summary
Make the main orchestrator prefer OpenAI's powerful tier by introducing/using `openai:powerful` and `MODEL_OPENAI_POWERFUL`.

## Steps
1. Extend provider alias defaults in `src/config/providers.ts`:
- add `openai:powerful`
- map it to env var `MODEL_OPENAI_POWERFUL`

2. Update orchestrator model priority:
- `.env`: `AGENT_ORCHESTRATOR_MODELS=openai:powerful,anthropic:powerful,google:balanced`
- `.env.example`: same ordering
- `src/config/models.ts` defaults: orchestrator preferred `openai:powerful`

3. Add env template key for discoverability:
- `.env.example`: `MODEL_OPENAI_POWERFUL=...`
- `.env`: add `MODEL_OPENAI_POWERFUL` value next to other OpenAI model aliases

4. Validation:
- run model/config tests
- runtime check via `getModelAssignment('orchestrator')`

5. Update `docs/HANDOVER.md`.

6. Commit and push to `main`.

## Acceptance Criteria
- Orchestrator resolves to `openai:powerful` as preferred model.
- `MODEL_OPENAI_POWERFUL` is supported and documented in env files.
- Fallbacks remain Claude then Gemini.
