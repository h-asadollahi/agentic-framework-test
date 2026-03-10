# Codex Plan 52 — Upgrade OpenAI/Google Model Aliases for Main Agents

## Summary
Apply upgraded model alias values for OpenAI and Google tiers used by Grounding, Cognition, Agency, and Interface routing.

## Steps
1. Update `.env` aliases:
- `MODEL_OPENAI_FAST=gpt-5-mini`
- `MODEL_OPENAI_BALANCED=gpt-5`
- `MODEL_OPENAI_REASONING=gpt-5.2`
- `MODEL_OPENAI_POWERFUL=gpt-5.2`
- `MODEL_GOOGLE_FAST=gemini-2.5-flash-lite`
- `MODEL_GOOGLE_BALANCED=gemini-2.5-pro`

2. Mirror the same aliases in `.env.example`.

3. Update `src/config/providers.ts` fallback defaults to match these alias recommendations when env vars are absent.

4. Validation:
- run unit tests
- verify alias lines in `.env` and `.env.example`.

5. Update `docs/HANDOVER.md`.

6. Commit and push to `main`.

## Acceptance Criteria
- OpenAI/Google alias values are upgraded in env and template.
- Provider defaults align with the same recommended versions.
- Tests pass with no regressions.
