# Codex Plan 20 — Reject Out-of-Scope Requests at Cognition Stage

Date: 2026-03-09
Status: Completed

1. Extend cognition output contract
- Add explicit rejection fields for out-of-scope requests (non-marketing or competitor-focused asks).
- Update cognition system prompt to enforce this behavior.

2. Add orchestrator early-stop path
- If cognition marks request as rejected, skip agency/interface execution.
- Return a clear rejection response and finish workflow immediately.

3. Add tests
- Unit tests for rejection detection/handling path.
- Ensure normal in-scope requests still execute unchanged.

4. Persist
- Update `docs/HANDOVER.md`.
- Mark plan completed.
- Commit and push to `main`.
