# Plan 61 — Prevent learn-route loops by preferring learned skills and synthesis fallback

## Goal
For prompts like "How is our VIP cohort performing this quarter?", prevent `general` synthesis subtasks from entering `learn-route` polling loops. Ensure Cognition/execute can use learned skills (e.g. `skills/learned/cohort-quarterly-kpi-rollup.md`) before route-learning.

## Changes
1. Tighten route-learning eligibility in execute routing.
- Update routing heuristics so synthesis/aggregation/consolidation tasks are **not** route-learning candidates.
- Preserve route-learning for genuine unknown external data-fetch tasks.

2. Add deterministic learned-skill handoff for synthesis tasks.
- In think/execute flow, if a prompt matches a materialized skill candidate, keep or inject a direct executable subtask path and avoid `general -> learn-route`.
- Ensure this path does not require human review.

3. Add explicit guardrail in cognition docs/prompt.
- Document that consolidation tasks should remain in-agent summarization or use matched learned skills, not route learning.

4. Tests.
- Add/extend unit tests for `shouldAttemptRouteLearning` to verify synthesis tasks return false.
- Add regression test for prompt matching "VIP cohort ... quarter" ensuring no route-learning trigger and skill-preferred behavior.

5. Documentation/handover update.
- Update `docs/HANDOVER.md` with root cause + fix + validation notes.

## Validation
- Run targeted unit tests for execute routing + think/cognition skill flow.
- Run full unit test suite if feasible.
- (Optional) smoke run in terminal with prompt: "How is our VIP cohort performing this quarter?" and verify pipeline no longer stalls in `learn-route`.
