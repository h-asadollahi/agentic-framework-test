# Codex Plan 56 — Mapp Intelligence API Workflows + api-fetcher Skill Preflight

Date: 2026-03-10
Status: Implemented

## Summary
Implement template-driven Mapp Intelligence retrieval through `api-fetcher` using Postman-aligned `analysis-query`/`report-query` workflows with `ref/*.json` templates. Preserve MCP-first behavior for existing MCP routes and integrate `skills/mcp-builder-SKILL.md` as deterministic preflight for API-call routes.

## Implementation Steps
1. Extend learned-route API schema with workflow metadata (`workflowType`, `requestBodySource`, `poll`, `resultSelection`).
2. Implement API workflow engine in `api-fetcher`:
   - `analysis-query`: create -> optional poll -> result fetch.
   - `report-query`: create -> report-status poll -> collect queryStates -> aggregate analysis results.
3. Add Mapp auth behavior in `api-fetcher`:
   - Use bearer token from env.
   - On 401, refresh once via OAuth client-credentials and retry once.
   - Runtime-only token refresh (no .env persistence).
4. Apply deterministic mcp-builder preflight for all API-call routes executed by `api-fetcher`; include diagnostics/checklist in output metadata.
5. Preserve MCP-first routing by adding tie-break priority in learned-route matching and add template-backed API routes for cohort/channel/daily in `knowledge/learned-routes.json`.
6. Update cognition knowledge docs to clarify MCP-vs-API split.
7. Add tests:
   - api-fetcher workflow success/failure/auth-refresh paths
   - route priority tie-break
   - Postman contract and ref template JSON validity
8. Update usage guide with required sample prompts and handover notes.

## Acceptance
- Cohort/channel/daily prompts route to `api-fetcher` and return compact workflow results.
- Existing MCP prompts remain `mcp-fetcher`.
- `api-fetcher` responses include mcp-builder preflight metadata for API routes.
- Tests pass for new workflow/auth/contract behavior.
