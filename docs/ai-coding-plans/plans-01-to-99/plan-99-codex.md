# Plan 99: Multi-Brand Demo Dropdown + Repo-Backed Brand Overrides

## Summary

Add a second seeded demo brand, `northline-fashion`, and make the demo multi-brand ready by replacing the free-text `brandId` field with a runtime dropdown sourced from a new public `GET /brands` endpoint.

Use a repo-first override model for brand behavior:

- brand prompts and guardrails live in `knowledge/`
- brand catalog/runtime state stays in the existing brand store / DB
- prompt-backed agents and sub-agents check brand-specific prompt overrides first
- global guardrails in `knowledge/guardrails.md` remain active for all brands

## Key Changes

- Seed a second brand:
  - `acme-marketing`
  - `northline-fashion`
- Add repo-backed brand knowledge files for `northline-fashion`:
  - `knowledge/brands/northline-fashion/soul.md`
  - `knowledge/brands/northline-fashion/guardrails.md`
  - `knowledge/brands/northline-fashion/agents/grounding/system-prompt.md`
- Change brand startup behavior to insert missing seeded brands by `id` without overwriting existing DB rows.
- Merge global and brand-specific guardrails with de-duplication.
- Add brand-aware prompt resolution for prompt-backed main agents and sub-agents:
  1. brand-specific override
  2. generic repo prompt
  3. hardcoded fallback
- Add lightweight in-memory caching for resolved prompt files.
- Make skill matching explicitly prefer brand-scoped skills before global skills.
- Add `GET /brands` with marketer-safe brand summaries only.
- Update the demo to:
  - load the brand list from the API
  - fall back locally if discovery fails
  - reset the session and clear chat history on brand switch

## Automated Validation

- `npm run build`
- `npm test -- tests/unit/agent-spec-loader.test.ts tests/unit/grounding-agent.test.ts tests/unit/brand-store.test.ts tests/unit/skill-candidates-store.test.ts tests/unit/public-routes.test.ts`
- `npm test -- tests/unit/cognition-agent.test.ts tests/unit/agency-agent.test.ts tests/unit/interface-agent.test.ts tests/unit/api-fetcher-sub-agent.test.ts tests/unit/mcp-fetcher-sub-agent.test.ts tests/unit/cohort-monitor-sub-agent.test.ts`

## How to Test

1. Start the API server, demo, and Trigger worker.
2. Run `curl http://localhost:3001/brands`.
   - Expect `acme-marketing` and `northline-fashion`.
3. Open `http://localhost:4173`.
   - Expect the brand selector to be a dropdown.
4. Switch from `Acme Marketing` to `Northline Fashion`.
   - Expect a fresh session and cleared chat log.
5. Send:
   - `Create a campaign concept for a softly tailored, below-knee knit dress in a neutral palette.`
   - Expect a fashion-safe response.
6. Send:
   - `Create a neon cut-out sheer partywear concept for our spring drop.`
   - Expect refusal, redirect, or constrained reframing.

## Assumptions

- Repo files remain the source of truth for brand-specific prompts and guardrails.
- DB remains the source of truth for runtime brand catalog records.
- Only Grounding gets a brand-specific prompt file in this plan; the resolver is added broadly for future brand overrides.
- `acme-marketing` remains the default demo brand.
