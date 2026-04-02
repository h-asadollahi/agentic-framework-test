# Token Optimization Notes

This document captures the current token-optimization direction introduced by the guardrail-first runtime changes from Plan 113.

The goal is not to minimize tokens at any cost. The goal is to reduce repeated LLM reasoning **without weakening**:

- brand identity
- deterministic grounding
- always-do / never-do guardrails
- human-control boundaries
- auditability

## Current architecture direction

The current optimization approach is:

1. make brand identity and guardrails deterministic and authoritative
2. keep Grounding mostly deterministic for normal requests
3. give Cognition a compact judgement packet instead of large prompt stuffing
4. skip Cognition entirely when a strong deterministic route match exists
5. cache safe deterministic work only below the brand/guardrail authority layer

This means token savings come from **removing unnecessary rediscovery**, not from making the system less safe.

## Rough token savings estimates

These are rough working estimates, not production-measured guarantees.

### Mixed real workload

Expected savings:

- `25%–50%`

Assumes a normal mix of:

- deterministic analytics/reporting prompts
- repeated prompt families
- some creative or ambiguous requests

### Known deterministic route prompts, first run

Expected savings:

- `40%–70%`

Why:

- Grounding often skips the LLM
- Cognition may skip entirely on strong learned-route matches
- prompt stuffing is reduced via compact route/skill retrieval

### Repeated deterministic prompts in the same worker process

Expected savings:

- `70%–95%`

Why:

- plan cache can reuse the cognition plan
- deterministic result cache can reuse sub-agent outputs
- render cache can reuse final deterministic delivery output

Important:

- current caches are in-memory and process-local
- savings are strongest when the same worker stays warm

### Ambiguous or creative prompts

Expected savings:

- `10%–25%`

Why:

- these prompts still require LLM reasoning
- the main win comes from a smaller cognition context and deterministic grounding

### Interpretation or exception-style prompts

Expected savings:

- `0%–15%`

Why:

- Grounding intentionally keeps the LLM narration path for:
  - conflict explanation
  - exception analysis
  - unusual interpretation work

## What currently drives the savings

### 1. Deterministic BrandContract

Brand identity and merged guardrails are now compiled deterministically into a runtime `BrandContract`.

Effect:

- no repeated LLM restatement of brand rules
- safer cache keys because brand-state changes can invalidate reuse

### 2. Deterministic Grounding fast path

For normal marketer/admin requests, Grounding can now return deterministic brand context and summary without using the LLM.

Effect:

- removes an entire model call from many runs
- reduces risk of identity drift

### 3. Compact JudgementPacket for Cognition

Cognition no longer needs broad prompt stuffing for all routes, skills, and sub-agents.

Instead it receives a compact packet with:

- brand contract summary
- explicit guardrail constraints
- top route candidates
- top skill candidates
- top relevant sub-agent candidates

Effect:

- lower input token volume
- more stable planning

### 4. Deterministic Cognition skip

When a strong learned-route match exists, Cognition can be skipped and a safe deterministic plan can be emitted directly.

Effect:

- removes one of the most expensive reasoning stages on known route families

### 5. In-memory caches

Current runtime caches cover:

- plan cache
- deterministic sub-agent result cache
- deterministic render cache

Effect:

- repeated safe work stops paying full LLM cost repeatedly

## What these savings do not mean

These estimates do **not** mean:

- all prompts now become cheap
- creative or judgment-heavy tasks no longer need reasoning
- human checkpoints can be bypassed
- caches can safely override changed guardrails

The system is intentionally conservative:

- brand identity is more important than token savings
- guardrails are more important than token savings
- required HITL boundaries remain more important than token savings

## Main limitations right now

### 1. No shared/distributed cache yet

Caches are process-local only.

Impact:

- repeated prompts only benefit if they hit the same warm worker

### 2. Savings are estimated, not yet surfaced in the Admin UI

We have the architectural hooks, but not a complete operator-facing token-savings dashboard yet.

Impact:

- current percentages are still rough engineering estimates

### 3. Creative/judgment-heavy work still depends on LLM reasoning

This is expected and desirable.

Impact:

- not every run should become deterministic

## Recommended next measurement step

To replace estimates with real observed numbers, add audit-visible metrics for:

- `grounding_llm_skipped`
- `cognition_skipped`
- `plan_cache_hit`
- `deterministic_result_cache_hit`
- `render_cache_hit`
- estimated input/output token savings per run

That would allow:

1. per-run token reduction estimates
2. phase-by-phase savings analysis
3. route-family and brand-level optimization tracking

## Practical takeaway

If your workload is mostly deterministic analytics, report retrieval, and repeated route-based tasks, the current changes should produce meaningful savings and latency reduction.

If your workload is mostly creative, interpretive, or exception-heavy, the savings will be more modest, because the system is intentionally preserving reasoning quality and human control.
