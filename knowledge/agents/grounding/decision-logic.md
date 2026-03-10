# Grounding Agent Decision Logic

This file documents how `pipeline-ground` handles Grounding outputs in a human-readable way.

## Runtime Behavior (Authoritative in Code)

The runtime logic is implemented in:
- `src/trigger/ground.ts`

Grounding stage flow:
1. Build execution context from `knowledge/soul.md` and `knowledge/guardrails.md`.
2. Execute Grounding Agent with the user message.
3. Parse Grounding output as JSON.
4. If parse succeeds:
   - Use parsed `brandIdentity` and `guardrails` when present.
   - Fall back to context defaults for any missing keys.
5. If parse fails:
   - Keep context-derived `brandIdentity` and `guardrails`.
   - Continue pipeline safely (non-fatal fallback).

## Why This Exists

- Keeps Grounding behavior understandable by humans.
- Makes it easy to evolve behavior safely in later iterations.
- Ensures fallback behavior is explicit and auditable.

## Change Guidance

- Update this file when Grounding parse/fallback behavior changes.
- Keep this documentation aligned with `src/trigger/ground.ts`.
- Prefer additive changes and preserve non-fatal fallback semantics.
