# Codex Plan 92

Status: Completed (2026-03-17)

## Goal
Implement a tenant-aware runtime that distinguishes admins from marketers, introduces database-managed brand context, adds scoped route/skill filtering, and ships an admin chat experience with forward-only LLM usage telemetry.

## Root Cause
- The runtime still assumes a single global marketer brand from `knowledge/soul.md` and `knowledge/guardrails.md`.
- Admins and marketers currently share the same brand-shaped pipeline context, which causes admin requests to inherit marketer-oriented prompts and formatting.
- Learned routes and skill candidates are not tenant-aware, so they cannot safely isolate one brand's reusable capabilities from another's.
- The admin workspace has observability pages, but no native chat surface for operator prompts or token-usage questions.
- LLM token usage is visible only at execution time and is not persisted for later admin reporting.

## Changes
1. Add request-context primitives (`audience`, `brandId`, `scope`, `source`) and thread them through pipeline payloads, execution context, telemetry, and admin/marketer entrypoints.
2. Introduce DB-backed brand configuration with seeded default brand data, plus tenant-aware context loading for marketer and admin flows.
3. Extend learned routes, skill candidates, route events, and Slack audit records with audience/brand-scope metadata and context-aware filtering.
4. Persist forward-only LLM usage telemetry and add a deterministic `token-usage-monitor` capability for admin observability prompts.
5. Add an Admin Chat page in the admin UI and require marketer requests to send an explicit `brandId`.
6. Cover the new runtime rules with targeted tests and update the operational docs.

## Acceptance Criteria
- Admin requests can run globally or for a selected brand without switching into marketer voice.
- Marketer requests require a `brandId` and only see the selected brand's context, routes, and skills.
- Admin chat can trigger the orchestrator and answer daily LLM token-usage questions using persisted telemetry.
- Route and Slack observability records include audience/brand-scope metadata.
- The seeded default brand keeps the existing local demo functional once the marketer UI sends `brandId`.

## Validation
- `npx tsc --noEmit`
- `npm test -- tests/unit/deliver-fast-path.test.ts tests/unit/admin-routes.test.ts`
- `node --check admin/public/app.js`
- `node --check admin/server.mjs`
- `node --check demo/app.js`
