# Plan 114 — Document Guardrail-First Token Savings Expectations

**Assistant:** Codex  
**Date:** 2026-04-02  
**Scope:** Capture the rough token-savings expectations from Plan 113 in a stable repo doc so the team does not need to rely on chat history.

## What changed
1. Added `docs/token-optimization.md`
2. Documented:
   - the optimization philosophy
   - rough savings ranges by workload type
   - the mechanisms currently producing the savings
   - current limitations
   - the next measurement step needed for real per-run savings visibility

## Why
- The user asked for the rough percentage savings to be documented in the repo.
- Those savings were previously only explained in chat.
- A standalone doc is safer than editing user-touched guides and easier for future assistants to find.

## Validation
- Reviewed the document content against the actual runtime changes from Plan 113.
- Verified it refers to the current architecture direction:
  - deterministic brand contract
  - deterministic grounding fast path
  - compact judgement packet
  - deterministic cognition skip
  - in-memory plan/result/render caches

## How to test
1. Open `docs/token-optimization.md`
2. Confirm it includes:
   - mixed-workload estimate
   - deterministic-route first-run estimate
   - repeated deterministic prompt estimate
   - creative/ambiguous prompt estimate
   - interpretation/exception prompt estimate
3. Confirm it clearly states these are rough estimates, not measured guarantees
