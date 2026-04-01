# Codex Plan 95

## Goal
Add an admin-only, sanitized deep audit trail for pipeline execution so operators can inspect prompts, model attempts, routing decisions, tool/MCP/API calls, outputs, skips, and failures without relying only on Trigger logs.

## Scope
- Add DB-backed audit run/event storage using the existing platform DB repository.
- Instrument main agents, sub-agents, and trigger orchestration with best-effort audit writes.
- Add admin API endpoints and admin UI pages for audit summary, run list, and event drill-down.
- Add 7-day retention cleanup for detailed audit events.
- Keep marketer-facing `trace` and `/message` response contract unchanged.

## Key decisions
- Admin-only visibility; marketer UI keeps the lightweight trace.
- Sanitized deep capture by default with redaction + truncation.
- Audit writes are best-effort and must never fail the pipeline.
- Use the existing platform DB + admin auth patterns; do not create a parallel storage system.
- Implement cleanup as a real Trigger task and opportunistically queue it from orchestrator no more than once per process/day.

## Implementation outline
1. Add `agent_audit_runs` and `agent_audit_events` tables plus repository methods for create/finalize/list/detail/summary/cleanup.
2. Add `src/observability/agent-audit-store.ts` and payload sanitization helpers.
3. Instrument:
   - `BaseAgent`
   - `BaseSubAgent`
   - deterministic sub-agents (`mcp-fetcher`, `api-fetcher`, `cohort-monitor`, `token-usage-monitor`)
   - trigger tasks (`orchestrate`, `ground`, `think`, `execute`, `deliver`, `notify`, `skill-learner`, `escalate` where applicable)
   - route/decision points in `execute` and orchestration.
4. Add admin endpoints:
   - `GET /admin/audit/summary`
   - `GET /admin/audit/runs`
   - `GET /admin/audit/runs/:pipelineRunId`
   - `GET /admin/audit/events`
   - optional manual cleanup trigger if useful for ops
5. Add admin UI Audit section with summary cards, run table, and event timeline/drill-down.
6. Add cleanup task and tests.

## Acceptance criteria
- Operators can inspect a pipeline run and see ordered deep audit events by stage/component in admin UI/API.
- Prompts, outputs, tool payloads, and headers are sanitized and truncated.
- Model attempts and deterministic routing decisions are visible.
- Detailed event retention is enforced at 7 days by cleanup task.
- Existing tests stay green and marketer API responses remain unchanged.
