# Plan 118 — Identity & Grounding: brand-dna.json + customer-dna.json

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-07
**Scope:** Formalize the structured Brand DNA and Customer DNA schemas (currently implicit in prose markdown). Create `brand-dna.json` and `customer-dna.json` per brand, wire them into two new grounding tools, and extend `GroundingResult` to include attribute envelopes and customer cohort data downstream.

## Context

The current grounding layer reads three markdown files (`soul.md`, `guardrails.md`, `brand-guidelines.md`) and produces a JSON output. This is sufficient for voice/tone enforcement, but it cannot support fit scoring, drift detection, or Customer DNA — because those require structured, machine-readable brand attributes, not prose.

Northline Fashion's `guardrails.md` already embeds implicit attribute envelopes as "Always Do" rules (`silhouette: straight_cut`, `colour: neutral_palette`). This plan formalizes that pattern into a proper schema, adopted consistently across all brands.

## Files changed

### New knowledge files (4 created)
- `knowledge/brand-dna.json` — default brand (Acme Marketing)
- `knowledge/customer-dna.json` — default customer DNA
- `knowledge/brands/northline-fashion/brand-dna.json` — Northline-specific (richest example)
- `knowledge/brands/northline-fashion/customer-dna.json` — Northline customer cohorts

### Source files modified (4)
- `src/core/types.ts` — add `AttributeEnvelope`, `BrandDna`, `CustomerCohort`, `CustomerDna`; extend `GroundingResult`
- `src/tools/knowledge-tools.ts` — add `readBrandDna` + `readCustomerDna` tools
- `src/agents/grounding-agent.ts` — register new tools in `allowedTools[]`
- `knowledge/agents/grounding/system-prompt.md` — add steps 4+5, extend output format

## What does NOT change
- `soul.md`, `guardrails.md`, `brand-guidelines.md` — augmented, not replaced
- `BrandIdentity` and `GuardrailConstraints` types — unchanged
- DB schema — no migrations (FitScore storage is plan-120)
- All admin UI and demo UI files — untouched

## Follow-on plans
- **Plan 120** — FitScore computation + DB storage + UI exposure (depends on this plan's schemas)
- **Plan 121** — Drift detection in grounding agent (depends on plan-120 FitScores in DB)

## How to test
1. Run pipeline with `brandId=northline-fashion` — grounding output should include `attributeEnvelopes`, `trendPolicy`, `customerDna`
2. Run with no `brandId` — those fields should be absent (graceful `found: false`)
3. Check Admin UI audit trail — grounding step shows the new fields in its output
