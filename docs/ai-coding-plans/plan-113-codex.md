# Plan 113 — Guardrail-First Token Optimization

**Assistant:** Codex  
**Date:** 2026-04-02  
**Scope:** Reduce token usage without weakening brand identity, deterministic guardrails, human control, or observability.

## What changed
1. Introduced a deterministic `BrandContract` as the authoritative runtime brand object.
2. Added deterministic Grounding fast path for normal requests while keeping optional LLM grounding narration for interpretation-like requests.
3. Added a compact `JudgementPacket` for Cognition with:
   - brand-contract summary
   - always-do / never-do constraints
   - top route candidates
   - top skill candidates
   - top sub-agent candidates
   - autonomy-policy hints
4. Added deterministic Cognition skip for strong learned-route matches.
5. Added in-memory caches for:
   - cognition plans
   - deterministic sub-agent results
   - deterministic delivery renders
6. Added route/skill inventory hashing so caches invalidate when the learned universe changes.

## Implementation notes
- `BrandContract` is compiled deterministically from resolved brand identity + merged guardrails and attached to `ExecutionContext`.
- Grounding no longer treats the LLM as the authority for brand identity or guardrails.
- Cognition now reasons over a compact judgement packet rather than full route/skill inventories.
- Deterministic fetch/render caches are keyed by `brandContract.hash` so updated brand rules invalidate reuse.
- Human-review boundaries remain authoritative; these changes only optimize deterministic safe paths.

## Validation
- `npm run build`
- `npm test`
- Manual runtime sanity check:
  - `node --input-type=module -e "import { buildExecutionContext } from './dist/core/context.js'; import { buildDeterministicGroundingSummary, shouldUseDeterministicGrounding } from './dist/trigger/ground.js'; import { createMarketerRequestContext } from './dist/core/request-context.js'; const context = await buildExecutionContext('manual-plan-112-check', createMarketerRequestContext('northline-fashion','api')); console.log(JSON.stringify({ brand: context.brandIdentity.name, contractVersion: context.brandContract.version, deterministic: shouldUseDeterministicGrounding('Create a campaign concept for a softly tailored, below-knee knit dress in a neutral palette.', context), summary: buildDeterministicGroundingSummary(context) }, null, 2));"`

## How to test
1. Run `npm run build`.
2. Run `npm test`.
3. Trigger a normal marketer analytics prompt and confirm Grounding does not call the LLM when no interpretation/exceptions are requested.
4. Trigger an interpretation-style prompt such as `Can we make an exception to the current brand rules for this request?` and confirm Grounding still allows the LLM narration path.
5. Re-run a deterministic route prompt twice and confirm:
   - Cognition can skip directly to the learned route when the match is strong.
   - repeated deterministic sub-agent outputs are served from cache within the process lifetime.
