# Codex Plan 53 — Remove OpenAI Temperature Warnings for Reasoning Models

## Summary
Fix Trigger warnings:
`AI SDK Warning (openai.responses / gpt-5-mini): temperature is not supported for reasoning models`
by conditionally omitting `temperature` for unsupported OpenAI model families.

## Steps
1. Add temperature capability helper in provider layer:
- Detect OpenAI model families where `temperature` is unsupported (GPT-5, o-series).

2. Update main agent generation path:
- `src/agents/base-agent.ts` should pass `temperature` only when supported.

3. Update sub-agent generation path:
- `src/trigger/sub-agents/base-sub-agent.ts` should follow the same rule.

4. Add unit tests for capability detection.

5. Run full tests.

6. Update `docs/HANDOVER.md`.

7. Commit and push to `main`.

## Acceptance Criteria
- No `temperature not supported for reasoning models` warnings for OpenAI GPT-5/o-series requests.
- Behavior remains unchanged for models that support temperature.
- Tests pass with no regressions.
