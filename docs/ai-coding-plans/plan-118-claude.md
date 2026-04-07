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

### Test 1 — Northline Fashion: attribute envelopes are loaded

**Goal:** Confirm grounding reads `brand-dna.json` and emits `attributeEnvelopes` + `trendPolicy` + `customerDna`.

**Why this prompt:** It names a specific product dimension (silhouette) that directly maps to a Brand DNA envelope. The grounding agent should include the envelope constraints in its output so cognition knows what "brand-compliant" means.

```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "Suggest campaign copy for our new straight-cut midi dress",
    "brandId": "northline-fashion"
  }'
```

**What to verify in the Admin UI audit trail (Grounding phase output):**
- `attributeEnvelopes.silhouette.allowed` contains `["straight_cut", "softly_tailored"]`
- `attributeEnvelopes.colour.allowed` contains `["neutral_palette"]`
- `trendPolicy.stance` = `"adapt"` with `quiet_luxury: "lead"`
- `customerDna.cohortLabel` = `"Fashion Marketers & Brand Teams"`
- `customerDna.fitAnchors` lists editorial campaign content

---

### Test 2 — Northline Fashion: envelope constraint visible when request is off-brand

**Goal:** Confirm the grounding output still contains the envelope even when the request pushes against it — so cognition and interface can use it to redirect.

**Why this prompt:** "neon" is explicitly in `colour.excluded`. The grounding agent should still load and emit the envelope so downstream agents know to reframe the request.

```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "Create a campaign for our new neon crop top",
    "brandId": "northline-fashion"
  }'
```

**What to verify:**
- Grounding output still includes `attributeEnvelopes` with `colour.excluded` containing `"neon"` and `length.excluded` containing `"crop"`
- The formatted response (Interface output) redirects toward the approved envelope rather than fulfilling the off-brand request

---

### Test 3 — No brandId: graceful omission

**Goal:** Confirm that when no `brand-dna.json` exists for the resolved brand, the fields are absent from the grounding output and the pipeline doesn't error.

**Why this prompt:** Admin-scoped request with no brandId — falls back to `knowledge/brand-dna.json` (Acme default). Different envelopes (tone/complexity/positioning instead of fashion dimensions) should appear.

```bash
curl -X POST http://localhost:3001/admin/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "Show me a summary of this week'\''s campaign performance"
  }'
```

**What to verify:**
- Grounding output includes `attributeEnvelopes` from the Acme default (`tone`, `complexity`, `positioning`) — NOT Northline fashion dimensions
- `customerDna.cohortLabel` = `"Marketing Professionals"`

---

### Test 4 — Customer DNA escalation trigger visible

**Goal:** Confirm that customer DNA escalation triggers are surfaced in grounding output so cognition can use them.

**Why this prompt:** "competitor" is an escalation trigger in the Northline customer DNA. Grounding should surface this in `customerDna.escalationTriggers` so cognition or interface knows to handle it carefully.

```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "How does our brand compare to Zara and COS?",
    "brandId": "northline-fashion"
  }'
```

**What to verify:**
- `customerDna.escalationTriggers` in grounding output includes `"competitor brand mentions"`
- The final response either declines the comparison or reframes toward Northline's own brand strengths

---

### Poll for results

After each `curl` above, poll until `status` is `COMPLETED`:

```bash
curl http://localhost:3001/status/<runId>
```

Check `.output.trace[0]` (grounding phase) for the new fields in the grounding agent's raw output.
Alternatively, open **Admin UI → Audit Trail**, click the run, expand the **Grounding** phase node to inspect the full JSON output inline.
