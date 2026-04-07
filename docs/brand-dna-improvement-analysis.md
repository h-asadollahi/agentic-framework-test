# Codebase Improvement Analysis — Brand DNA Strategy Alignment

**Date:** 2026-04-07
**Based on:**
- Brand DNA Strategy Explorer HTML (product vision document)
- "Building AI Agents — The AI Is the Easy Part" (4-layer framework)

---

## What's Already Well-Aligned

The codebase architecture mirrors the article's 4 layers almost exactly — grounding-agent → cognition-agent → agency-agent → interface-agent — which is the right foundation. The Northline Fashion brand is a model example of what mature brand DNA looks like: explicit attribute envelopes (`silhouette: straight_cut`, `colour: neutral_palette`), a voice profile with never-say lists, and brand-specific grounding overrides. The guardrail system is solid (70% confidence threshold, HITL escalation, PII/billing protection). Token optimization with deterministic fast-paths is well-designed.

---

## Gap Analysis by Layer

### Layer 1 — Identity & Grounding

**What the HTML describes:** Attribute Envelopes, Compositional Grammar, Trend Policy, Customer DNA, Brand-Customer Fit Score (BCFS), Semantic Distance & Drift measurement.

**Current state:** `soul.md` + `guardrails.md` per brand. Northline Fashion has explicit envelopes (`silhouette`, `fit`, `length`, `colour`, `material`). The default brand (`knowledge/soul.md`) has no envelopes at all. No Customer DNA concept exists. No BCFS or drift measurement exists — "drift" is mentioned once but never computed.

**Gaps:**
1. **No standard attribute envelope schema** — Northline has it informally in guardrails; other brands don't. There's no enforced structure, so the grounding agent can't reason about envelopes consistently.
2. **Customer DNA is completely missing** — The strategy doc treats it as a first-class concept on par with Brand DNA. Without it, the system can't compute fit or detect cohort drift.
3. **No fit scoring (BCFS)** — The strategy doc describes a numeric Brand-Customer Fit Score. Nothing in the codebase computes this. The 70% confidence threshold in guardrails is a proxy but not a true fit score.
4. **No drift detection** — No mechanism checks whether an agent's output stays within the brand's attribute envelopes. Semantic drift from brand voice or product guidelines can go undetected.

**Recommended improvements:**
- Define a formal `brand-dna.json` schema (attribute envelopes with allowed values/ranges, compositional grammar rules, trend policy stance) that lives alongside `soul.md` — and adopt it for all brands, using Northline as the template.
- Add a `customer-dna.json` per brand: cohort attributes (audience segment, engagement patterns, expected vocabulary), sourced initially from `brand-guidelines.md` and extended by `cohort-monitor`.
- Add a `FitScore` computed value: ratio of output attributes that fall within the brand's envelope. Store per prompt run in the DB. Expose in Admin UI and marketer dashboard.
- Add a drift check step inside the grounding agent: after building the brand identity, score the previous N outputs against the envelope and flag if drift > threshold.

---

### Layer 2 — Cognition

**What the HTML describes:** A 7-step productization pipeline (Signal Ingestion → Semantic Parsing → Brand DNA Matching → Customer DNA Matching → Fit Scoring → Gap Analysis → Output Generation). Explicit brand-fit as a planning gate before any task executes.

**Current state:** Cognition agent is strong at task decomposition. It uses a JudgementPacket (brand contract, guardrails, route candidates, skill candidates). However:
- No per-subtask confidence score — subtasks are planned without a `confidence` value, making it hard to surface uncertainty early.
- The 7-step pipeline from the strategy doc is not reflected in how cognition plans tasks. Planning is flat (array of subtasks) rather than pipeline-shaped.
- No explicit brand-fit gate before executing subtasks — the grounding output is passed in, but cognition doesn't block low-fit plans.

**Recommended improvements:**
- Add `confidence: number (0–1)` to each subtask in cognition's output JSON. Cognition should already have enough context (brand contract + route confidence) to emit this. Auto-escalate to HITL if any critical subtask has confidence < 0.6.
- Add an explicit `brandFitCheck` step at the top of cognition's planning: does the user's request align with the brand's attribute envelopes? If not, explain the misalignment and propose a re-scoped version rather than blindly executing.
- Optionally: add a `pipelineStage` field to each subtask mapping to the 7-step productization pipeline. This makes the admin audit trail much more interpretable.

---

### Layer 3 — Agency

**What the HTML describes:** Surface-area-specific execution (product grid, entry experiences, search, personalization), returns data as a semantic misalignment signal, cohort-level drift detection.

**Current state:** Three sub-agents (cohort-monitor, mcp-fetcher, api-fetcher). `cohort-monitor` is **mock-only** — it returns hardcoded data, not real cohort analytics. `learned-routes.json` is empty (version 1.0.0, `routes: []`). No result validation after sub-agent execution. No returns-signal integration.

**Gaps:**
1. **cohort-monitor is mock-only** — this is the sub-agent meant to detect fit drift, but it never touches real data. This makes the entire drift-detection and brand-health story impossible to demonstrate.
2. **Learned routes are empty** — the route-learning architecture is built, but no routes have ever been materialized. The system always falls back to LLM routing.
3. **No result validation** — agency accepts whatever sub-agents return, with no schema check. Bad/incomplete results silently propagate.
4. **No surface-area-specific agents** — all tasks go through generic mcp-fetcher or api-fetcher. The strategy doc's 4 funnel surfaces (product, entry, search, personalization) aren't represented as distinct execution paths.
5. **Returns as semantic signal** — the HTML prominently features returns insight as empirical proof of brand-customer fit failure. There's no mechanism to ingest returns data and feed it back as a drift signal.

**Recommended improvements:**
- **Connect cohort-monitor to real data** (even a simple CSV/webhook import would unblock this). This is the highest-leverage improvement — it makes Brand DNA go from theoretical to measurable.
- **Seed learned-routes.json** with a baseline set of routes from the existing MCP and API configurations. The architecture is ready; it just needs initial population.
- **Add result schema validation in agency**: each sub-agent should declare its output schema; agency validates against it before aggregating. Failed validation → retry or HITL.
- **Returns signal endpoint**: add a `POST /intake/returns` route that accepts return event data, extracts the product attributes, and scores them against the brand's envelope. Flag returns that match "outside-envelope" patterns as brand-fit failures.

---

### Layer 4 — Interface

**What the HTML describes:** Multi-surface communication, observability that lets humans "dial involvement up and down," confidence-visible responses.

**Current state:** Notification routing to 4 Slack channels is well-done. Brand voice is applied. But fit scores, drift indicators, and per-subtask confidence are never surfaced in the actual response. The marketer-facing demo dashboard is a placeholder (plan-118, pending). The admin audit trail is good but shows raw events without brand-health framing.

**Gaps:**
1. **No brand health metrics in any UI** — admin and marketer UIs show token counts and run status, but nothing about brand fit score, drift rate, or envelope compliance.
2. **Response doesn't include confidence signal** — the interface agent produces formatted markdown but doesn't tell the marketer "I'm 85% confident this is brand-aligned."
3. **Marketer dashboard is a placeholder** — plan-118 addresses activity graphs, but doesn't include brand health (fit score, drift, envelope compliance rate).
4. **The Brand DNA Strategy Explorer HTML is disconnected** — it's a standalone strategy brief with no connection to the live system. There's no "Strategy" or "Brand DNA" section in the demo.

**Recommended improvements:**
- **Include brand fit score + confidence in interface output** — add a small status line to every response: "Brand alignment: 94% · Confidence: High." This makes the system's reasoning visible without cluttering the response.
- **Add brand health section to marketer dashboard** (extends plan-118): Envelope Compliance Rate over time, Drift Trend, Top out-of-envelope requests.
- **Add a `/strategy` or `/brand-dna` page to the demo UI** that renders a simplified version of the Strategy Explorer HTML — showing the brand's attribute envelopes, customer DNA profile, and live BCFS. This bridges the strategy doc to the live system.
- **Expose token optimization savings in admin UI** — the optimization docs estimate 25–95% savings; none of it is visible in the admin. A "Performance" card showing cache hit rate and estimated token savings would validate the architecture.

---

## The HTML File as an Asset

The Brand DNA Strategy Explorer HTML is a polished, self-contained strategy document. It contains the exact conceptual vocabulary the codebase should use. Two specific uses:

1. **As a grounding document** — add it (or a JSON-extracted version of its concepts) to `knowledge/` as `brand-dna-framework.md`. The grounding agent can reference it to explain *why* attribute envelopes and fit scoring matter when prompting marketers.
2. **As a demo UI page** — serve it at `demo/#strategy` as the "What is Brand DNA?" onboarding page. New marketers open the demo, see the strategy brief, then go to Dashboard to see the live data. This makes the system immediately legible.

---

## Priority Order

| Priority | Improvement | Layer | Impact |
|----------|-------------|-------|--------|
| 1 | Connect cohort-monitor to real data | Agency | Unlocks entire drift/fit story |
| 2 | Formal attribute envelope schema (all brands) | Grounding | Foundation for scoring |
| 3 | Customer DNA per brand | Grounding | Enables BCFS |
| 4 | FitScore computed per prompt run + stored in DB | Grounding + Interface | Measurable brand health |
| 5 | Per-subtask confidence in cognition output | Cognition | Better HITL triggering |
| 6 | Brand health section in marketer dashboard | Interface | Visible to marketers |
| 7 | Seed learned-routes.json with baseline routes | Agency | Activates deterministic fast-path |
| 8 | Result validation in agency | Agency | System reliability |
| 9 | Returns signal intake endpoint | Agency | Closes the loop |
| 10 | `/strategy` page in demo (serve the HTML) | Interface | Onboarding + legibility |
