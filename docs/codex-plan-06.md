# Codex Plan 06 — Prevent Cohort Questions Falling to General Route-Learning

Date: 2026-03-06
Status: Completed

1. Improve cognition fallback behavior
- Update `src/trigger/think.ts` parse-failure fallback logic.
- For cohort-like prompts, fallback subtask should target `cohort-monitor` (not `general`).

2. Add execution-time safeguard
- Update unknown-agent routing path in `src/trigger/execute.ts`.
- If a subtask is cohort-oriented, prefer built-in `cohort-monitor` before learned-route matching and route-learning.

3. Extend routing helper/tests
- Add helper(s) in `src/trigger/execute-routing.ts` for cohort-oriented detection.
- Add unit tests to prevent regression in fallback strategy selection.

4. Docs and persistence
- Update `docs/HANDOVER.md` with root cause and fix summary.
- Run `npm test` and `npx tsc --noEmit`.
- Mark this plan completed, commit, and push to `main`.
