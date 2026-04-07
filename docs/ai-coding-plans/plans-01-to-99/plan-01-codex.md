# Codex Plan 01 — Non-Blocked Work

Date: 2026-03-06
Status: Completed

1. Baseline verification
- Re-check current repository state and run `npm test` + `npx tsc --noEmit` to establish a clean pre-change baseline.

2. Wire escalation into pipeline failures
- Update `src/trigger/orchestrate.ts` to trigger `escalateTask` when a guardrail stage fails (Grounding, Cognition, Agency, Interface).
- Keep existing failure behavior intact (still fail the run) while adding escalation side-effects and logs.

3. Strengthen smart fallback router tests (non-Slack)
- Add focused unit tests for route-learning decision logic in agency execution paths that do not require Slack API access.
- Cover these scenarios:
- learned route exists -> uses `api-fetcher`
- no learned route + data-like request -> attempts `learn-route`
- non-data-like unknown task -> falls back to Agency LLM

4. Add parser/store unit tests for learned routes
- Add tests for:
- `parseRouteInfoReply` parsing URL/method/headers/params from sample thread replies
- `learnedRoutesStore` load/add/find/increment behavior using temp test fixtures

5. Documentation update
- Update `docs/HANDOVER.md` with a short “Post-Handover Progress” section summarizing completed non-blocked changes and remaining blocked items.

6. Validation and handoff
- Re-run `npm test` and `npx tsc --noEmit`.
- Provide a concise change report with file references and any residual risks.

## Explicitly Out of Scope (blocked)

1. Any test requiring Slack thread-read scopes (`channels:history`) approval.
2. End-to-end verification of `conversations.replies()` polling behavior.
