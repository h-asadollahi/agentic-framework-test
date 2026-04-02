# Development Handover — Continue from Here

> **Last updated:** 2026-04-02
> **Previous AI:** Claude Sonnet 4.6 via Claude Code (plan-100-claude)
> **Next AI:** OpenAI Codex (or any agent picking this up)

---

## Project Overview

Multi-agent marketing platform built with **Trigger.dev v3** (orchestration) + **Vercel AI SDK v6** (AI layer) + **TypeScript** + **Hono** (API server).

**Repo:** `git@github.com:h-asadollahi/agentic-framework-test.git` (branch: `main`)

### Architecture

```
POST /message → Hono API (port 3001)
  → tasks.trigger("orchestrate-pipeline")
    → Stage 1: Grounding   (loads knowledge/soul.md, guardrails)
    → Stage 2: Cognition   (decomposes into subtasks, assigns sub-agents)
    → Stage 3: Agency      (executes subtasks via sub-agent registry)
    → Stage 4: Interface   (formats response, determines notifications)
    → Notifications        (Slack, Email, Webhook — fire-and-forget)
```

### Key Directories

```
src/
├── agents/              # Guardrail agents (grounding, cognition, agency, interface)
├── channels/            # Notification adapters (Slack, Email, Webhook)
├── config/              # Model aliases (providers.ts) and agent assignments (models.ts)
├── core/                # Types, errors, logger
├── escalation/          # Slack-based human-in-the-loop (approve/reject via thread replies)
├── memory/              # Short-term (per-session) and long-term (cross-session) memory
├── providers/           # Model router (resolves "anthropic:fast" → LanguageModel)
├── routing/             # Smart fallback router (learned API routes)
├── tools/               # Knowledge file readers (knowledge/soul.md, guardrails.md)
├── trigger/             # Trigger.dev tasks (orchestrate, ground, think, execute, deliver, notify, escalate, learn-route)
│   └── sub-agents/      # Plugin system (registry, base class, plugins/)
│       └── plugins/     # cohort-monitor, api-fetcher
└── index.ts             # Hono API server
```

---

## Post-Handover Progress (2026-03-10, Codex)

### Plan 113: Guardrail-first token optimization with deterministic grounding and compact cognition

Status: Implemented and validated on 2026-04-02 (Codex).

Why this was added:
- Token usage needed to come down without weakening brand identity, guardrails, or human control.
- The existing pipeline still spent reasoning tokens repeatedly on brand context and full route/skill inventories.
- Grounding needed to become authoritative and deterministic instead of relying on an LLM to restate brand rules each run.

What changed:
- Added a deterministic `BrandContract` runtime object as the authoritative brand artifact for execution.
  - Built from resolved brand identity plus merged guardrails.
  - Carries explicit `alwaysDo`, `neverDo`, voice/content policy state, a stable `version`, and a cache-safe `hash`.
- Refactored Grounding into:
  - deterministic grounding core for normal requests
  - optional LLM narration path only for interpretation-style requests
- Grounding LLM output is no longer allowed to override brand identity or guardrails.
  - It can contribute an explanatory summary when needed.
- Added a compact `JudgementPacket` for Cognition containing:
  - audience/scope
  - brand contract summary
  - explicit non-negotiables
  - autonomy policy hints
  - top learned-route candidates
  - top skill candidates
  - top relevant sub-agent summaries
- Stopped stuffing large route/skill inventories into the Cognition prompt when the judgement packet is available.
- Added deterministic skip logic so strong learned-route matches can bypass Cognition entirely and emit a safe plan directly.
- Added in-memory caches for:
  - cognition plans
  - deterministic sub-agent results
  - deterministic delivery renders
- Cache keys include brand-contract and inventory hashes so changed guardrails/routes/skills invalidate reuse correctly.

Important files changed:
- `src/core/types.ts`
- `src/core/context.ts`
- `src/core/brand-contract.ts`
- `src/trigger/ground.ts`
- `src/trigger/think.ts`
- `src/trigger/execute.ts`
- `src/trigger/deliver.ts`
- `src/trigger/judgement-packet.ts`
- `src/optimization/runtime-caches.ts`
- `src/agents/cognition-agent.ts`
- `src/routing/learned-routes-store.ts`
- `src/routing/skill-candidates-store.ts`
- `knowledge/agents/cognition/system-prompt.md`
- `tests/unit/brand-contract.test.ts`
- `tests/unit/judgement-packet.test.ts`
- `tests/unit/runtime-caches.test.ts`
- `tests/unit/ground-output-parser.test.ts`
- `docs/ai-coding-plans/plan-113-codex.md`

Validation:
- `npm run build`
- `npm test`
- Manual runtime sanity check:
  - built a live `ExecutionContext` for `northline-fashion`
  - verified `brandContract.version` and `brandContract.hash` exist
  - verified deterministic grounding is used for a standard fashion-safe prompt
  - verified deterministic grounding summary is present without needing the Grounding LLM

Manual verification recommended:
1. Trigger a normal analytics prompt such as `List all available dimensions and metrics in Mapp Intelligence`.
2. Confirm Grounding does not spend an LLM call for the normal case.
3. Trigger an interpretation/conflict prompt such as `Can we make an exception to the current brand rules for this request?`
4. Confirm Grounding still allows the narration/interpretation path.
5. Trigger a deterministic route prompt twice in the same worker process.
6. Confirm the second run benefits from plan/result/render cache hits.

Operational notes for the next assistant:
- All new caches are in-memory and process-local only in this wave.
- `BrandContract` is now the runtime authority for identity and guardrails; do not reintroduce LLM-authored brand state as canonical.
- `JudgementPacket` is designed to keep Cognition compact and explicit. If you expand it later, prefer retrieval quality over inventory bulk.
- The plan requested by the user was numbered 112 conceptually, but the repo already had shared plan number 112 in use, so the implementation was saved as `plan-113-codex.md` to preserve shared numbering.

### Plan 107: Audit Trail redesign — Trigger.dev-style tree + detail pane

Status: Implemented and pushed on 2026-04-01 (Claude Sonnet 4.6).

Problem addressed:
- The Admin UI Audit Trail showed a flat timeline grouped by phase with no parent/child structure.
- Inspecting a single event required scrolling through a wall of JSON for every event in the same phase.
- No focused detail pane — all context was visible at once, making it hard to isolate a single node.

What changed (frontend-only, no backend changes):
- Replaced the runs table + flat timeline sections with a single 2-column workspace (`audit-workspace`).
- Left panel (300 px): compact runs list at top (status icon, run ID, Inspect button) + scrollable run tree below.
- Right panel (flex): node detail pane — shows key fields for the selected node, with collapsible payload JSON for event nodes.
- Tree hierarchy: Run → Phase (grouped by `event.phase`) → Component (grouped by `componentKind::componentId`) → Event (leaf).
- Each node shows a type icon (🔵 run / 🟣 phase / 🤖 or ⚡ component / ℹ ✓ ⚠ ✗ event) and a status badge.
- Clicking a node: selects it (highlights row, populates detail pane) + toggles expand/collapse if it has children.
- Phases start expanded; components start collapsed (matching Trigger.dev's progressive disclosure UX).

Important files changed:
- `admin/public/index.html` — added audit workspace CSS + replaced two old surface-card sections with new 2-column layout
- `admin/public/app.js` — replaced `renderAuditRuns` (table → compact list), replaced `renderAuditRunDetails` (timeline → tree), added `buildAuditTree`, `renderAuditTreeNode`, `selectAuditNode`, `renderAuditNodeDetail`, `auditStatusBadge`, `auditNodeIcon`

Validation:
- Open Admin UI → Audit Trail.
- Summary cards + filters remain at the top.
- Left panel shows compact runs list; right panel shows "Select a node" placeholder.
- Click Inspect on a run → tree appears with 🔵 run at root, 🟣 phase children, ⚡/🤖 components, and event leaves.
- Click any node → right pane shows type-specific fields (run: prompt + session; phase: event count + timing; component: model + tokens; event: eventType + payload).
- Clicking a component expands/collapses its events; clicking a phase expands/collapses its components.

### Plan 108: Dismiss false-alarm Slack HITL threads immediately

Status: Implemented in code, admin UI summary counters, tests, and docs on 2026-04-01.

Problem addressed:
- Slack HITL flows previously forced operators into two bad choices when a review thread was a false alarm:
  - provide the requested attributes anyway
  - wait for the full timeout window
- Route-learning threads only supported `provide route info` or timeout.
- Escalation threads supported `approve` / `reject`, but had no explicit no-action / false-alarm resolution.
- This created unnecessary 30-minute waits for route-learning and long waits for escalations that should simply be closed.

What changed:
- Added explicit dismissal / false-alarm parsing to both Slack HITL flows.
- Supported phrases now include:
  - `dismiss`
  - `ignore`
  - `false alarm`
  - `no action needed`
  - similar no-action variants
- Route-learning polling now:
  - checks newest Slack replies first
  - resolves immediately with `dismissed` when a human marks the request as a false alarm
  - posts a confirmation back into the Slack thread
  - does not save a route in that case
- Escalation polling now:
  - recognizes dismissal replies separately from hard rejection
  - resolves immediately with `dismissed`
  - posts a confirmation back into the Slack thread
- Admin Slack HITL summary now tracks `dismissed` as a first-class status instead of forcing operators to infer it from timeouts or rejections.

Behavioral outcome:
- Admins/marketers can explicitly close false-alarm HITL threads without waiting for timeout.
- Timeout still exists for true no-response cases.
- Escalation callers still receive a non-approved outcome for dismissed threads, so the system remains safe by default.
- Admin UI now distinguishes:
  - `approved`
  - `dismissed`
  - `rejected`
  - `timed_out`

Important files changed:
- `src/routing/route-learning-escalation.ts`
- `src/trigger/learn-route.ts`
- `src/escalation/slack-escalation.ts`
- `src/trigger/escalate.ts`
- `src/core/types.ts`
- `src/routing/learned-routes-db-repository.ts`
- `src/routing/learned-routes-store.ts`
- `admin/public/app.js`
- `admin/public/index.html`
- `tests/unit/route-learning-parser.test.ts`
- `tests/unit/slack-escalation-parser.test.ts`
- `tests/unit/admin-routes.test.ts`
- `docs/usage-guide.md`
- `docs/ai-coding-plans/plan-108-codex.md`

Validation:
- `npm test -- tests/unit/route-learning-parser.test.ts tests/unit/slack-escalation-parser.test.ts tests/unit/admin-routes.test.ts`
- `node --check admin/public/app.js`
- `npm run build`

Manual verification recommended:
1. Trigger a route-learning Slack HITL thread.
2. Reply in the thread with `false alarm` or `dismiss`.
3. Confirm the Trigger task resolves immediately instead of waiting for timeout.
4. Trigger an escalation Slack HITL thread.
5. Reply with `ignore` or `no action needed`.
6. Confirm the thread resolves immediately and the admin Slack page shows `dismissed`.

Operational note for the next assistant:
- `dismissed` is intentionally separate from `rejected`.
- Upstream system safety still treats dismissed escalations as non-approved, which is the desired fail-safe default.
- If future product behavior needs "dismiss and continue anyway", that should be a separate policy change rather than reusing the current dismissal status.

### Plan 109: Tighten repo guideline for assistant-scoped commits

Status: Implemented in docs on 2026-04-01.

What changed:
- Updated `docs/repo-guidelines.md` under `Git Hygiene`.
- The guideline is now explicit that in multi-assistant workflows, each assistant should commit and push only its own changes.
- Also made explicit that another assistant's edits or the user's manual edits must not be included unless the user specifically asks for a combined commit/push.

Why this matters:
- The repo is now being edited by multiple coding assistants plus manual user changes.
- This reduces accidental mixed commits and keeps authorship and rollback boundaries clearer.

Files changed:
- `docs/repo-guidelines.md`
- `docs/ai-coding-plans/plan-109-codex.md`
- `docs/HANDOVER.md`

Validation:
- Reviewed `docs/repo-guidelines.md` for the new assistant-scoped commit wording.

Manual verification recommended:
1. Open `docs/repo-guidelines.md`
2. Read the `Git Hygiene` section
3. Confirm the assistant-scoped commit rule is present

### Plan 110: Audit Trail run-list enrichment and Run Tree modal

Status: Implemented in admin UI code and handover docs on 2026-04-01.

What changed:
- Enlarged the Audit Trail run list so each row shows more context directly:
  - pipeline run id
  - brand id
  - status
  - audience
  - event count
  - quick sub-meta for scope/source/start time
- Kept row click behavior for inline selection.
- Changed `Inspect` so it opens a dedicated modal for the full audit run tree.
- Reused the existing admin modal pattern instead of inventing a new overlay system.
- Refactored audit tree/detail rendering so the same tree renderer now supports:
  - inline Audit page rendering
  - modal rendering
- Added safer modal body state handling because the admin UI now has more than one modal surface.

Files changed:
- `admin/public/app.js`
- `admin/public/index.html`
- `docs/ai-coding-plans/plan-110-codex.md`
- `docs/HANDOVER.md`

Validation:
- `node --check admin/public/app.js`
- `npm run build`

Manual verification recommended:
1. Open Admin UI → Audit Trail.
2. Confirm the run list is wider and each row now shows brand/status/audience/event count.
3. Click a run row and confirm inline selection still updates the main audit detail pane.
4. Click `Inspect` on a run and confirm a modal opens.
5. In the modal, confirm:
   - Run Tree appears on the left
   - node detail appears on the right
   - close button, backdrop click, and `Esc` all close the modal

### Plan 111: Audit Trail corrected to table-first list plus modal tree

Status: Implemented in admin UI code and handover docs on 2026-04-01.

Why this follow-up was needed:
- Plan 110 improved the run inspector but still kept too much of the custom audit workspace pattern.
- The requested UX was closer to `Learned Routes`:
  - full run list on the page
  - popup modal for the tree inspection

What changed:
- Replaced the inline audit workspace with a full run table on the Audit Trail page.
- The page now lists run metadata directly in columns:
  - run id
  - brand
  - status
  - audience
  - scope
  - source
  - events
  - warnings
  - errors
  - started
  - finished
- Clicking a run row or `Inspect` now opens the Run Tree inspector modal.
- The modal remains the place where:
  - the tree is shown on the left
  - node detail is shown on the right

Files changed:
- `admin/public/app.js`
- `admin/public/index.html`
- `docs/ai-coding-plans/plan-111-codex.md`
- `docs/HANDOVER.md`

Validation:
- `node --check admin/public/app.js`
- `npm run build`

Manual verification recommended:
1. Open Admin UI → Audit Trail.
2. Confirm the page shows a run table, not the previous left-rail audit workspace.
3. Click `Inspect` on any run.
4. Confirm the modal opens with the Run Tree on the left and detail pane on the right.
5. Confirm row click also opens the same modal.

### Plan 95: Deep agent audit trail for admin visibility

Status: Implemented in code, admin UI/API, cleanup task, and tests on 2026-04-01.

Problem addressed:
- Trigger.dev already showed run-level logs, but the product itself did not persist a structured, queryable deep audit trail for agents and sub-agents.
- Admins had no first-class way to inspect rendered prompts, model retries, decomposition decisions, tool calls, sanitized outputs, skip reasons, or deterministic fast-path decisions inside the project UI.
- Existing observability (`trace`, `llm_usage_events`, prompt usage telemetry) was useful but too shallow for debugging route/routing/agent behavior end-to-end.

What changed:
- Added DB-backed audit persistence:
  - `agent_audit_runs`
  - `agent_audit_events`
- Extended `src/routing/learned-routes-db-repository.ts` with:
  - create/finalize run helpers
  - event persistence
  - filtered run/event listing
  - aggregate summary queries
  - retention cleanup for expired detailed events
- Added sanitized audit helpers:
  - `src/observability/agent-audit-sanitizer.ts`
  - `src/observability/agent-audit-store.ts`
- Instrumented main LLM agents (`BaseAgent`) and LLM-backed sub-agents (`BaseSubAgent`) to persist:
  - `invoke`
  - `prompt_snapshot`
  - `model_attempt`
  - `result`
  - `error`
- Instrumented deterministic sub-agents and trigger tasks to persist:
  - routing decisions
  - route hydration
  - synthesis skips / deterministic fast paths
  - MCP / API tool-call previews
  - notification queueing
  - skill-learner decisions/materialization results
- Added audit-aware Trigger task cleanup:
  - `src/trigger/audit-cleanup.ts`
  - opportunistically queued by orchestrator, best-effort, with 7-day event retention
- Added admin APIs:
  - `GET /admin/audit/summary`
  - `GET /admin/audit/runs`
  - `GET /admin/audit/runs/:pipelineRunId`
  - `GET /admin/audit/events`
- Added admin UI `Audit` page with:
  - summary cards
  - filtered run list
  - run detail timeline
  - expandable raw sanitized payloads

Behavioral outcome:
- Admin operators can inspect a pipeline run from inside the admin UI without depending only on Trigger logs.
- Audit persistence is best-effort and does not fail marketer/admin pipeline delivery when DB/audit writes fail.
- The marketer-facing `/message` contract and lightweight `trace` remain unchanged.
- Sanitization is now explicit:
  - secrets/auth headers/tokens/cookies/passwords are redacted
  - long prompts/payloads are truncated into readable previews
  - only framework-controlled reasoning artifacts are stored (plans, outputs, decisions, tool calls), not hidden provider chain-of-thought

Additional stability work completed during this implementation:
- Fixed async unit tests that still treated `buildExecutionContext()` as synchronous.
- Hardened learned-route JSON fallback handling:
  - `knowledge/learned-routes.json` can now be represented as a valid empty catalog without parse noise
  - `src/routing/learned-routes-store.ts` treats a blank fallback file as an empty route catalog instead of crashing
- Fixed migration ordering in `src/routing/learned-routes-migration.ts` so DB configuration errors surface before JSON parse errors.
- Backward-compatible helper improvement in `src/trigger/skill-learning.ts` so older call sites/tests that pass options in the third argument still resolve correctly.

Important files added:
- `src/observability/agent-audit-sanitizer.ts`
- `src/observability/agent-audit-store.ts`
- `src/trigger/audit-cleanup.ts`
- `docs/ai-coding-plans/codex-plan-95.md`

Important files changed:
- `src/routing/learned-routes-db-schema.ts`
- `src/routing/learned-routes-db-repository.ts`
- `src/admin/routes.ts`
- `admin/public/index.html`
- `admin/public/app.js`
- `src/agents/base-agent.ts`
- `src/trigger/sub-agents/base-sub-agent.ts`
- `src/trigger/orchestrate.ts`
- `src/trigger/ground.ts`
- `src/trigger/think.ts`
- `src/trigger/execute.ts`
- `src/trigger/deliver.ts`
- `src/trigger/notify.ts`
- `src/trigger/skill-learner.ts`
- deterministic plugin files under `src/trigger/sub-agents/plugins/`

Validation:
- `npm run build`
- `npm test`
- Final result at handoff time: `46/46` test files, `206/206` tests passing

Operational notes for the next assistant:
- The admin audit feature expects the same platform DB used by learned routes / telemetry (`DATABASE_URL`).
- The admin UI now exposes three observability surfaces:
  - `Admin Chat`
  - `Token Usage`
  - `Audit`
- If local working tree noise appears in `knowledge/skill-candidates.json`, treat it as user/test-local unless explicitly asked to commit it.
- `knowledge/learned-routes.json` is currently safe as a minimal valid empty fallback catalog when DB is the primary route source.

Recommended first verification steps after pulling this state:
1. Start the admin UI and open the new `Audit` page.
2. Run one marketer prompt end-to-end and confirm an audit run appears with stage + sub-agent events.
3. Open a run detail and verify prompt snapshots / tool-call previews are redacted and truncated correctly.
4. Confirm the marketer-facing response shape is unchanged and still only exposes the lightweight `trace`.

### Plan 97: Repo guideline for post-implementation testing

Status: Implemented locally on 2026-04-01.

What changed:
- Added [docs/repo-guidelines.md](./repo-guidelines.md) as the repo-level workflow guideline for future contributors and coding assistants.
- Documented a new standing rule:
  - after implementation, run relevant automated validation
  - then test the actual feature/workflow that was changed when feasible
  - include a short `How to test` checklist for each implemented plan when possible
- Added a pointer to the new guideline in [docs/usage-guide.md](./usage-guide.md).

Why this was added:
- It reduces the gap between code-level completion and actual feature verification.
- It makes future handoffs easier because each plan should now include reproducible validation steps, not just implementation notes.

Recommended default format going forward:
- `Automated validation:` commands that were run
- `Manual verification:` user-facing checks that were performed
- `Not tested:` explicit gaps
- `How to test:` short reproducible steps

### Plan 96: Audit event sequence overflow hotfix

Status: Implemented locally on 2026-04-01 after the first live audit-enabled run exposed a DB type mismatch.

Problem observed:
- Live run `run_cmnfwu6dw00163ann8mnsnueu` logged `Agent audit event write failed` during grounding.
- The failing insert targeted `agent_audit_events.sequence`.
- Runtime-generated sequence values use `Date.now() * 1000 + counter`, which produces values around `1.7e15`.
- The DB column had been created as `INTEGER`, so PostgreSQL rejected those inserts.

Fix applied:
- Widened `agent_audit_events.sequence` from `INTEGER` to `BIGINT` in the schema.
- Added automatic repository startup migration:
  - `ALTER TABLE agent_audit_events ALTER COLUMN sequence TYPE BIGINT`
- Kept sequence generation unchanged so event ordering semantics stay stable.

Validation:
- `npm run build`
- `npm test -- tests/unit/agent-audit-store.test.ts tests/unit/admin-routes.test.ts`

Operational note:
- Existing local DBs should self-heal on the next app/worker startup because repository `init()` now widens the column automatically.

### Plan 94: Prompt-centric token telemetry and dedicated admin token usage page

Status: Implemented in code, tests, and docs on 2026-03-17.

Problem addressed:
- `llm_usage_events` already captured per-agent and per-sub-agent token usage, but it was optimized for model-call detail rather than one-row-per-user-prompt reporting.
- Admin token answers therefore lacked prompt history with the original user/admin prompt text plus summed input/output/total tokens.
- The admin workspace only exposed lightweight telemetry cards inside `Admin Chat`, not a dedicated token-usage page.

What changed:
- Added a stable request-level identifier:
  - `RequestContext.pipelineRunId`
- Added prompt-level telemetry storage:
  - `llm_prompt_usage_runs`
  - one row per orchestrated admin/marketer request
  - stores:
    - root `pipelineRunId`
    - `sessionId`
    - audience / scope / brand / source
    - original `userPrompt`
    - summed `inputTokens`
    - summed `outputTokens`
    - summed `totalTokens`
    - `llmCallCount`
    - prompt status (`running`, `completed`, `failed`, `rejected`)
- Kept detailed per-call telemetry in `llm_usage_events`, but linked those rows to the prompt aggregate via `pipelineRunId`.
- `orchestrate-pipeline` now:
  - creates the prompt row at start
  - finalizes it on `completed`, `failed`, or `rejected`
- Every successful LLM event from `BaseAgent` and `BaseSubAgent` now:
  - inserts the detailed `llm_usage_events` row
  - atomically increments the matching prompt aggregate row
- `token-usage-monitor` now answers from DB-only prompt telemetry plus provider/model breakdowns:
  - prompt totals come from `llm_prompt_usage_runs`
  - provider/model totals come from `llm_usage_events`
- Extended admin telemetry APIs:
  - `GET /admin/llm-usage/summary`
    - now includes prompt-centric totals:
      - `totalPrompts`
      - `totalLlmCalls`
      - `totalInputTokens`
      - `totalOutputTokens`
      - `totalTokens`
  - `GET /admin/llm-usage/prompts`
    - paginated prompt history with audience / brand / day-window filters
- Added a dedicated `Token Usage` page in the admin UI with:
  - summary cards
  - daily prompt-level breakdown
  - recent prompt history table
  - audience / brand / day-window filters
  - previous / next pagination
- Kept the smaller telemetry cards inside `Admin Chat`, but made them prompt-aware.

Behavioral outcome:
- Admins can inspect token usage as prompt runs, not just as raw model invocations.
- Deterministic admin token-usage answers remain fast because they are pure DB aggregation.
- Zero-token deterministic requests still create prompt rows, so request history stays complete even when no LLM call occurs.

Important current limitation:
- Prompt-level history is forward-only from this deployment; there is no backfill from older `llm_usage_events` rows into `llm_prompt_usage_runs`.
- Provider/model totals are intentionally filtered to the new prompt-linked telemetry (`pipelineRunId` present), so prompt totals and provider totals stay consistent.

Validation:
- `npm test -- tests/unit/admin-routes.test.ts tests/unit/deliver-fast-path.test.ts tests/unit/admin-observability-routing.test.ts tests/unit/llm-usage-store.test.ts`
- `npx tsc --noEmit`
- `node --check admin/public/app.js`

### Plan 93: Clean up bad admin token-usage learned routes and harden observability matching

Status: Implemented in code, docs, and live cleanup on 2026-03-17.

Problem observed:
- The admin prompt `Give me the daily token usage across all the LLMs used for this project by marketers.` triggered Slack route-learning instead of the built-in `token-usage-monitor`.
- The deterministic admin matcher in `src/trigger/think.ts` only matched singular `llm`, so plural `LLMs` fell through to generic cognition.
- That generic plan created route-learning noise and persisted three bad learned routes:
  - `route-012`
  - `route-013`
  - `route-014`
- Those routes pointed to an Anthropic usage-report endpoint without valid credential/header handling and should not remain in the store.

What changed:
- Extracted admin token-usage intent parsing into `src/trigger/admin-observability.ts`.
- Broadened deterministic admin matching so prompts mentioning:
  - `LLMs`
  - `models`
  - `providers`
  - `OpenAI`
  - `Claude`
  - `Anthropic`
  - `Gemini`
  map to `token-usage-monitor`.
- Added an Agency-stage fallback in `src/trigger/execute.ts` so admin token-usage subtasks are rerouted to `token-usage-monitor` before they can enter `learn-route`.
- Added regression coverage in `tests/unit/admin-observability-routing.test.ts`.
- Deleted the bad routes directly from the live admin store through the authenticated admin API:
  - `route-012`
  - `route-013`
  - `route-014`

Provider research notes:
- Anthropic:
  - Official external source is the Usage & Cost API.
  - Live check on 2026-03-17 with the current local credential returned `401`, so this project will need the correct Anthropic admin-level credential before using that endpoint directly.
- OpenAI:
  - Official external sources are the organization Usage API and Costs API.
  - Live check on 2026-03-17 with the current local credential returned `403`, so this project will need an org/admin-capable OpenAI key before using those endpoints directly.
- Gemini:
  - Public Gemini API exposes `usageMetadata` on generation responses and supports `countTokens` for preflight estimation.
  - Live check on 2026-03-17 with the current local Gemini key returned `200` and included `usageMetadata`, so Gemini can be integrated from provider response metadata immediately.

Operational outcome:
- Admin token-usage prompts using plural/provider phrasing no longer create Slack-learned garbage routes.
- The three bad Anthropic usage routes are gone from the live admin store.
- Internal `llm_usage_events` remains the safest cross-provider source until Anthropic/OpenAI admin usage credentials are added.

Validation:
- `npm test -- tests/unit/admin-observability-routing.test.ts tests/unit/execute-fast-path.test.ts tests/unit/admin-routes.test.ts`
- `npx tsc --noEmit`
- Live verification:
  - admin chat run `run_cmmuqi70x005339nn2zyk4z2v`
  - prompt: `Give me the daily token usage across all the LLMs used for this project by marketers.`
  - completed through `token-usage-monitor` and returned marketer-scoped totals for `acme-marketing` without creating new Slack route-learning work

### Plan 92: Tenant-aware admin + multi-brand marketer runtime, admin chat, and LLM telemetry

Status: Implemented in code and targeted tests on 2026-03-17.

Problem addressed:
- The runtime still assumed one global marketer brand from `knowledge/soul.md` / `knowledge/guardrails.md`.
- Admins and marketers shared the same brand-shaped execution context, which made admin prompts inherit marketer-oriented voice and response framing.
- Learned routes, skill candidates, route events, and Slack HITL audit rows were not tenant-aware, so one brand's reusable capabilities could bleed into another brand's marketer experience.
- The admin workspace had observability pages, but no native chat surface for operator prompts such as LLM token-usage reporting.

What changed:
- Added first-class request context primitives in `src/core/types.ts` and `src/core/request-context.ts`:
  - `audience`
  - `brandId`
  - `scope`
  - `source`
- `buildExecutionContext()` is now tenant-aware and DB-backed brand-aware:
  - marketer requests require a `brandId`
  - admin requests can run global with system/admin identity
  - brand-scoped requests load DB-backed brand config
- Added DB-backed brands and forward-only LLM usage telemetry:
  - `brands`
  - `llm_usage_events`
  - schema and repository updates in `src/routing/learned-routes-db-schema.ts` and `src/routing/learned-routes-db-repository.ts`
- Learned routes, route events, Slack HITL rows, and skill candidates now persist/filter on audience + scope + brand:
  - `src/routing/learned-routes-store.ts`
  - `src/routing/skill-candidates-store.ts`
  - `src/trigger/learn-route.ts`
  - `src/routing/route-learning-escalation.ts`
  - `src/channels/slack-channel.ts`
  - `src/escalation/slack-escalation.ts`
- Marketer API requests now require `brandId`:
  - `POST /message` rejects unknown brands and threads a marketer request context into `orchestrate-pipeline`
- Added admin chat endpoints under `/admin/*`:
  - `GET /admin/brands`
  - `GET /admin/llm-usage/summary`
  - `POST /admin/chat/message`
  - `GET /admin/chat/status/:runId`
  - `GET /admin/chat/session/:sessionId/history`
  - `DELETE /admin/chat/session/:sessionId`
- Added the first admin-native deterministic capability:
  - `token-usage-monitor`
  - deterministic cognition fast-path maps token-usage prompts directly to it
  - deterministic deliver formatting renders daily/provider/model totals without needing Interface LLM summarization
- Added an `Admin Chat` page to the admin UI with:
  - brand scope selector
  - marketer telemetry summary cards
  - admin chat session management
  - markdown response rendering
  - trace/raw JSON popovers
- Updated demo marketer chat to send `brandId: "acme-marketing"` by default so the seeded local brand continues to work.

Behavioral outcome:
- Admins now have a system-oriented chat surface that can ask the orchestrator operational questions.
- The first shipped admin capability is LLM token-usage reporting across all brands or a selected brand.
- Marketer flows are explicitly brand-scoped instead of implicitly sharing one global brand identity.
- Learned routes and skill candidates now have the metadata needed for an Admin / Multi-Brand Marketer environment.

Important current limitation:
- Token usage telemetry is forward-only from the point this feature was deployed; no historical billing/provider backfill is included in this batch.
- Admin chat is read-only in v1. It can inspect and report, but it does not mutate brands, routes, or settings through chat yet.

Validation:
- `npx tsc --noEmit`
- `npm test -- tests/unit/deliver-fast-path.test.ts tests/unit/admin-routes.test.ts`
- `node --check admin/public/app.js`
- `node --check admin/server.mjs`
- `node --check demo/app.js`

### Plan 81: Stop deterministic MCP formatting subtasks from entering `learn-route`

Status: Implemented in code and tests.

Problem observed:
- Prompt: `List all available dimensions and metrics in Mapp Intelligence`
- The original MCP route match was correct, but a second `general` formatting subtask entered `learn-route` and triggered false admin HITL / route-learning Slack noise.
- The formatting subtask wording looked like:
  - `Normalize and present the returned dimensions/metrics list in a concise, scannable format...`

Root cause:
- Cognition correctly matched the deterministic MCP route (`route-002` / `mcp-fetcher`).
- Cognition sometimes adds a second `general` post-processing subtask for presentation/normalization.
- Unknown-task fallback in `pipeline-execute` matched learned routes by description text only and did not treat this wording as synthesis.
- Synthesis detection was too narrow and missed phrases such as:
  - `normalize`
  - `present`
  - `readable`
  - `scannable`
  - `grouped`
  - `de-duplicated`
- Because those subtasks still contained data words such as `metrics`, they were incorrectly classified as route-learning candidates.

What changed:
- Added shared synthesis-description detection in:
  - `src/trigger/execute-routing.ts`
- Expanded synthesis keywords to include normalization/presentation wording commonly produced by cognition.
- `pipeline-think` deterministic-route pruning now recognizes those formatting subtasks as redundant synthesis:
  - `src/trigger/think.ts`
- `pipeline-execute` now adds a deterministic-route-context safety guard:
  - if an unknown `general` / `assistant` subtask has deterministic route context (`routeId` or successful deterministic dependency) and is synthesis-like, it will not go to `learn-route`
  - `src/trigger/execute.ts`

Tests added/updated:
- `tests/unit/execute-routing.test.ts`
  - formatting subtasks are treated as synthesis, not route-learning
  - deterministic route context forces `llm-fallback` over `learn-new-route`
- `tests/unit/execute-fast-path.test.ts`
  - deterministic `mcp-fetcher` result + normalization/presentation follow-up gets skipped as redundant synthesis
- `tests/unit/think-deterministic-optimization.test.ts`
  - cognition pruning removes normalization/presentation follow-up for single deterministic MCP route

Validation:
- Focused tests passed:
  - `npm test -- tests/unit/execute-routing.test.ts tests/unit/execute-fast-path.test.ts tests/unit/think-deterministic-optimization.test.ts`
- Full unit suite passed:
  - `npm test`
  - Result: `41/41` files, `187/187` tests

Operational outcome:
- Deterministic MCP prompts like the dimensions/metrics catalog should now stay on the MCP path without opening route-learning.
- False Slack admin HITL alerts caused only by deterministic formatting subtasks should stop.

Next recommended verification after switching accounts:
1. Re-run the prompt:
   - `List all available dimensions and metrics in Mapp Intelligence`
2. Confirm in Trigger:
   - cognition still emits `mcp-fetcher` / `route-002`
   - execute does not spawn `learn-route` for the formatting subtask
3. Confirm Slack:
   - no admin HITL message is sent for normalization/presentation-only follow-up work
4. If a similar case still appears, inspect the exact cognition wording first; the synthesis detector is now broader, but new phrasing variants may still need to be folded into the shared detector in `src/trigger/execute-routing.ts`

### Plan 82: Route-specific deterministic deliver renderer for `route-002` catalog outputs

Status: Implemented in code and tests.

Observed problem:
- Root run: `run_cmmtcszej00303bnnddz8fs1o`
- Prompt: `List all available dimensions and metrics in Mapp Intelligence`
- `pipeline-think` correctly produced a single deterministic subtask:
  - `mcp-fetcher` with `routeId: route-002`
- `pipeline-execute` retrieved the compacted catalog payload successfully, but the marketer-facing response still collapsed to a low-value generic success summary.

Root cause:
- `pipeline-deliver` used the deterministic deliver fast path.
- The fast path previously rendered only `agencyResult.summary` plus extracted text-like `criticalFacts`.
- `list_dimensions_and_metrics` returns a serialized JSON payload with:
  - `dimensionsCount`
  - `metricsCount`
  - `dimensions[]`
  - `metrics[]`
- That payload was not route-aware, so the fast path never surfaced the catalog counts or names in the marketer summary.

What changed:
- Added structured deterministic-result parsing in:
  - `src/trigger/deliver.ts`
- Added a route/tool-specific deterministic renderer for `list_dimensions_and_metrics`:
  - shows total dimensions count
  - shows total metrics count
  - shows grouped sample sections for dimensions and metrics
  - keeps raw payload out of the marketer default summary while leaving the underlying payload available in run data / trace tooling
- Kept the existing generic deterministic deliver fast path unchanged as the fallback for non-catalog routes.
- Loosened `parseAgentJson()` generic typing so typed `CognitionResult`, `AgencyResult`, and `DeliveryResult` parsing passes `npx tsc --noEmit` again:
  - `src/trigger/agent-output-parser.ts`

Tests added/updated:
- `tests/unit/deliver-fast-path.test.ts`
  - catalog payload renders counts plus grouped sections
  - catalog path no longer falls back to `Results were retrieved successfully.`

Validation:
- Focused tests passed:
  - `npm test -- tests/unit/deliver-fast-path.test.ts tests/unit/delivery-fidelity.test.ts`
- Typecheck passed:
  - `npx tsc --noEmit`

Operational outcome:
- Prompts like `List all available dimensions and metrics in Mapp Intelligence` now stay on the low-latency deterministic deliver path and return useful marketer-facing catalog summaries.
- The marketer now sees counts plus readable grouped samples instead of only a generic retrieval confirmation.

Still pending separately:
- Skill-candidate prompt matching can still be noisy for generic `Mapp Intelligence` wording.
- The unrelated `mapp-monthly-analysis-usage-summary` reuse note from the investigated run should be handled as a separate matching-tightening task rather than in the deliver layer.

### Plan 83: Admin UI now uses server-side `ADMIN_API_TOKEN` instead of browser token input

Status: Implemented in code and docs.

Problem observed:
- The separate admin UI previously required the operator to paste the raw `ADMIN_API_TOKEN` into a browser text input before it could call `/admin/*`.
- That added friction for routine local admin use and encouraged manually handling the secret in the browser.

What changed:
- `admin/server.mjs` now loads `.env` automatically and exposes:
  - `/admin-ui-config` for lightweight UI bootstrap config
  - `/_admin_proxy/*` for server-side forwarding to `/admin/*`
- The admin proxy now attaches `Authorization: Bearer <ADMIN_API_TOKEN>` server-side when `ADMIN_API_TOKEN` is configured.
- `admin/public/index.html` removed the manual token field and replaced it with a server-auth status indicator.
- `admin/public/app.js` now:
  - bootstraps from `/admin-ui-config`
  - sends admin API traffic through `/_admin_proxy/*`
  - keeps the API base configurable in the UI without exposing the token to frontend code

Validation:
- Syntax checks passed:
  - `node --check admin/server.mjs`
  - `node --check admin/public/app.js`
- Local smoke check passed (mock upstream + admin server):
  - `/admin-ui-config` returned `authMode: "env-token"`
  - proxied `/admin/health` request reached the upstream with `Authorization: Bearer test-admin-token`

Operational outcome:
- The admin UI no longer requires token entry in the browser.
- `ADMIN_API_TOKEN` stays on the admin server side instead of being copied into static frontend assets.
- The UI still lets the operator change the API base URL while reusing the same server-side auth flow.

### Plan 84: Admin UI redesigned into a sidebar dashboard shell

Status: Implemented in UI and docs.

Problem observed:
- The separate admin UI had the right functionality, but it still looked like a stack of raw utility panels instead of a durable admin workspace.
- The next phase needs an admin-oriented shell so new features can be added section-by-section without reworking the page each time.

What changed:
- Rebuilt `admin/public/index.html` into a dashboard shell with:
  - left sidebar navigation
  - hero/header area for API base, auth state, and workspace refresh
  - summary cards for route inventory, storage health, backfill, and export actions
  - a main workspace split into route explorer, route inspection, activity feed, and run watch areas
- Updated `admin/public/app.js` to match the new shell while preserving existing admin functionality.
- Upgraded the event and run summary panels from raw JSON blocks to admin-friendly cards/lists:
  - event feed now renders event type, route/run metadata, and detail chips
  - run watch now renders status breakdown plus latest run cards
- Visual direction now uses a soft beige/lilac dashboard theme inspired by the requested Mapp-style admin layout.

Files:
- `admin/public/index.html`
- `admin/public/app.js`
- `admin/README.md`
- `docs/usage-guide.md`

Validation:
- `node --check admin/public/app.js`
- `node --check admin/server.mjs`
- `npm test -- tests/unit/admin-routes.test.ts`

Operational outcome:
- The admin UI now feels like an extensible admin control center instead of a temporary utility page.
- Existing learned-route admin operations still work, but the page now has clear slots for future audit/settings/approval features.

### Plan 85: Admin dashboard refresh fixed for Trigger run summary panel

Status: Implemented in code, tests, and live verification.

Problem observed:
- Admin dashboard refresh triggered `GET /_admin_proxy/admin/runs/summary?limit=20`
- The proxy returned `502 Bad Gateway`
- The surfaced detail was:
  - `Trigger run summary fetch failed: 404`

Root cause:
- `src/admin/routes.ts` used the wrong Trigger management endpoint for run listing:
  - `${TRIGGER_API_URL}/api/v3/runs?limit=...`
- The local Trigger instance does not expose run listing on `/api/v3/runs`
- The installed Trigger SDK uses:
  - `/api/v1/runs` for run list
  - `/api/v3/runs/:id` for single-run retrieval
- Because of that mismatch, the admin run summary fetch received a `404`, and the admin API wrapped it into a `502`

What changed:
- Updated admin run summary fetching in:
  - `src/admin/routes.ts`
- The admin backend now requests:
  - `${TRIGGER_API_URL}/api/v1/runs?page[size]=...`
- Added a regression test in:
  - `tests/unit/admin-routes.test.ts`
  - verifies the admin endpoint calls Trigger's `/api/v1/runs` list route
- Updated admin/operator docs to note that the `Run Watch` panel depends on a reachable Trigger API:
  - `admin/README.md`
  - `docs/usage-guide.md`

Validation:
- Focused test passed:
  - `npm test -- tests/unit/admin-routes.test.ts`
- Typecheck passed:
  - `npx tsc --noEmit`
- Live local verification passed:
  - `GET http://localhost:4174/_admin_proxy/admin/runs/summary?limit=20`
  - Result: `200 OK` with run summary payload

Operational outcome:
- Admin dashboard refresh works again for the run summary panel.
- The root cause was an endpoint version mismatch, not the new admin shell or proxy auth flow.

### Plan 86: Admin dashboard hero compacted with info popover

Status: Implemented in UI and docs.

Problem observed:
- The top admin hero still consumed more space than necessary.
- It permanently showed the full API base URL plus server auth and workspace status details.
- The long descriptive sentence also made the admin header feel heavier than needed for routine operator use.

What changed:
- Updated `admin/public/index.html` so the hero now shows:
  - title
  - refresh action
  - a small `i` info control
- Removed the long hero description text.
- Moved server details behind the new info popover:
  - API base URL
  - server auth state
  - workspace status
- Kept the existing DOM hooks intact:
  - `apiBase`
  - `authState`
  - `status`
- Updated docs in:
  - `admin/README.md`
  - `docs/usage-guide.md`

Validation:
- Static UI change only; no admin route logic changed.
- Existing DOM ids for the admin frontend behavior were preserved.

Operational outcome:
- The admin header is noticeably shorter and less busy.
- Operators can still access server details quickly, but only when needed.

### Plan 87: Learned routes moved into a dedicated page with modal inspection

Status: Implemented in UI and docs.

Problem observed:
- The dashboard still carried the full learned-routes table inline, which made the admin overview heavier than necessary.
- Route inspection also lived inline under the table, so reviewing route details expanded the page instead of feeling like a focused admin action.

What changed:
- Updated `admin/public/index.html` to split the admin UI into separate frontend pages:
  - dashboard page
  - learned-routes page
- Sidebar navigation now switches between those pages inside the same admin app.
- Moved the route explorer off the dashboard and into the dedicated learned-routes page.
- Removed the inline inspection section from the page layout.
- Added a route-details modal so `Inspect` now opens a pop-up instead of rendering below the table.
- Updated `admin/public/app.js` to:
  - support hash-based page switching
  - preserve route selection highlighting
  - open and close the inspection modal
  - keep existing route delete / refresh flows working

Docs updated:
- `admin/README.md`
- `docs/usage-guide.md`

Validation:
- `node --check admin/public/app.js`
- `npm test -- tests/unit/admin-routes.test.ts`

Operational outcome:
- The dashboard is now focused on overview and observability.
- Learned-route management has its own page.
- Route inspection feels lighter and more task-focused because it opens in a modal.

### Plan 88: Activity Feed and Run Watch moved into dedicated pages

Status: Implemented in UI and docs.

Problem observed:
- Even after moving learned routes out, the dashboard still carried the full activity feed and run watch panels inline.
- Those two operational views are useful enough to stand on their own instead of competing with the overview page.

What changed:
- Updated `admin/public/index.html` so:
  - activity feed now has its own page
  - run watch now has its own page
- Sidebar navigation now includes dedicated page navigation for:
  - activity feed
  - run watch
- Removed the inline activity and run-watch sections from the dashboard page.
- Updated `admin/public/app.js` hash routing so the new pages work the same way as the learned-routes page.
- Preserved the existing frontend data bindings:
  - `events`
  - `eventsCount`
  - `runs`
  - `runsCount`

Docs updated:
- `admin/README.md`
- `docs/usage-guide.md`

Validation:
- `node --check admin/public/app.js`
- `npm test -- tests/unit/admin-routes.test.ts`

Operational outcome:
- The dashboard is now a cleaner overview page.
- Activity Feed and Run Watch are both easier to use because each has its own dedicated admin surface.

### Plan 89: Slack HITL observability page with counters and latest tracked threads

Status: Implemented in code, tests, and docs.

Problem observed:
- The admin UI had no visibility into Slack human-in-the-loop activity even though escalations and route-learning prompts were already using Slack threads.
- There was no durable way to answer operational questions like:
  - how many admin-channel Slack prompts got a response?
  - how many route-learning threads resulted in a saved route?
- Refreshing the admin UI could not reconstruct those metrics from the existing route/event tables.

What changed:
- Added a new Postgres-backed `slack_hitl_threads` audit table in the learned-routes DB repository init path.
- Instrumented both Slack HITL flows so tracked thread state is persisted:
  - `src/escalation/slack-escalation.ts`
    - records `sent`
    - records `approved` / `rejected`
    - records `timed_out`
  - `src/routing/route-learning-escalation.ts`
    - records `sent`
    - records `responded`
    - records `timed_out`
  - `src/trigger/learn-route.ts`
    - records `route_added` when a Slack-guided route is successfully saved
- Extended `learnedRoutesStore` + admin API with Slack observability endpoints:
  - `GET /admin/slack/summary`
  - `GET /admin/slack/messages`
- Both endpoints default to `SLACK_ADMIN_HITL_CHANNEL` if no explicit `channel` query param is passed.
- Added a dedicated `Slack HITL` page to the admin UI with:
  - tracked-thread counters
  - responded / route-added metrics
  - escalation outcome counts
  - latest tracked Slack HITL thread list

Docs updated:
- `admin/README.md`
- `docs/usage-guide.md`

Validation:
- `node --check admin/public/app.js`
- `npm test -- tests/unit/admin-routes.test.ts`
- `npx tsc --noEmit`

Operational outcome:
- Admins can now refresh the UI and still see durable Slack HITL counters/history when `DATABASE_URL` is configured.
- The admin workspace now exposes the latest tracked admin-channel Slack threads without asking operators to inspect Slack manually.
- Route-learning success is visible from the admin UI as both a response event and a route-added outcome.

### Plan 90: Usage-guide admin-HITL prompt replaced with a live-verified prompt

Status: Implemented in docs after live verification.

Problem observed:
- The usage-guide admin-HITL example prompt was too vague and did not reliably trigger admin human review in current runtime behavior.
- In a live run on March 17, 2026, the old wording produced a clarification-style response instead of a Slack admin HITL notification.

What changed:
- Live-tested new admin-HITL prompt candidates against the local pipeline before editing docs.
- Verified that this prompt produced an admin HITL Slack notification in deliver output:
  - `Please assess this campaign risk. Campaign plan: send the promotion to all EU subscribers, including previously unsubscribed contacts, because the consent suppression feed may be stale after a critical authorization failure. Hold the send for human review if it is unsafe.`
- Updated `docs/usage-guide.md` in both the alert-routing section and the notification-routing section to use the verified wording.
- Adjusted the documented expectation to be honest about current behavior:
  - `SLACK_ADMIN_HITL_CHANNEL` should be triggered
  - additional monitoring alerts may also appear when the run surfaces extra failures

Live verification:
- Rejected old candidate (out of scope): root run `run_cmmumibww001b39nnawxhciju`
- Verified replacement prompt:
  - root run `run_cmmumnjbs002039nnji28v9fc`
  - deliver run `run_cmmumnpw2002639nn4f00px2t`
- Verified deliver output included a Slack notification with recipient `brand-cp-admin-hitl`

Operational outcome:
- The usage guide now points to a prompt that is actually aligned with the current pipeline behavior.
- Future manual validation of admin HITL should be less confusing and less dependent on trial-and-error wording.

### Plan 91: Slack admin page now records direct Slack notifications too

Status: Implemented in code, tests, and docs.

Problem observed:
- A prompt could successfully trigger `SLACK_ADMIN_HITL_CHANNEL`, but the admin Slack page still showed `No tracked Slack HITL threads yet`.
- Root cause: the admin page only read audit rows written by threaded escalation and route-learning flows.
- Deliver-stage admin HITL notifications were sent through the generic Slack channel adapter, so they reached Slack but were never written to the audit table.

What changed:
- Extended the Slack audit model to support `kind: "notification"` alongside:
  - `escalation`
  - `route-learning`
- Updated `src/channels/slack-channel.ts` so successful direct Slack sends are now recorded in the audit store with:
  - channel
  - message timestamp
  - subject/body preview
  - priority
  - notification metadata source
- Updated summary logic so direct notifications do not inflate pending-response counts meant for threaded HITL flows.
- Updated the admin UI copy so the Slack page now refers to tracked Slack `messages` instead of only `threads`.
- Added a focused unit test covering the Slack channel audit path.

Docs updated:
- `admin/README.md`
- `docs/usage-guide.md`

Validation:
- `node --check admin/public/app.js`
- `npm test -- tests/unit/admin-routes.test.ts tests/unit/slack-channel.test.ts`
- `npx tsc --noEmit`

Operational outcome:
- New admin-HITL Slack notifications sent through `send-notification` will now appear on the admin Slack page after refresh.
- The page now better reflects the real mix of Slack activity: direct notifications plus threaded HITL flows.
- Notifications that were sent before this patch are not auto-backfilled unless inserted separately.

### Plan 77: Deliver-stage latency optimization (deterministic fast path)

Status: Implemented in code and tests.

What changed:
- Added deterministic fast path in `pipeline-deliver`:
  - For safe single-route deterministic outputs (`mcp-fetcher`, `api-fetcher`, `cohort-monitor`) with successful results and no human-review requirement, deliver now skips the Interface LLM call.
  - It renders a human-readable markdown response directly from agency summary + critical facts.
- For non-fast-path runs, deliver now sends compacted result previews to the Interface agent (instead of full raw subtask payloads) to reduce prompt-token load and latency.
- Notification normalization/enforcement behavior remains unchanged (admin/marketer HITL + monitoring routing still applied after rendering).

Files:
- `src/trigger/deliver.ts`
- `tests/unit/deliver-fast-path.test.ts`

Validation benchmark:
- Prompt: `Show engagement changes for our at-risk cohort in the last 30 days`
- Before (`run_cmmm3cdsy007q3annp21cu8z3`):
  - `pipeline-deliver`: `22,361ms`
- After (`run_cmmm3hoqz00813annhc1u9twm`):
  - `pipeline-deliver`: `17ms`
- After minor humanization tweak (`run_cmmm3jhfk008b3annglp10pq9`):
  - `pipeline-deliver`: `13ms`

### Plan 78: Sub-agent default model priority switched to OpenAI-first

Status: Implemented in code and focused tests.

What changed:
- Switched `BaseSubAgent` default model order to OpenAI-first:
  - preferred: `openai:balanced`
  - fallbacks: `anthropic:balanced`, `google:balanced`
- Updated sub-agent plugin constructors to OpenAI-first:
  - `cohort-monitor`: `openai:fast` -> `anthropic:fast`, `google:fast`
  - `api-fetcher`: `openai:fast` -> `anthropic:fast`, `google:fast`
  - `mcp-fetcher`: `openai:fast` -> `anthropic:fast`, `google:fast`

Files:
- `src/trigger/sub-agents/base-sub-agent.ts`
- `src/trigger/sub-agents/plugins/cohort-monitor.ts`
- `src/trigger/sub-agents/plugins/api-fetcher.ts`
- `src/trigger/sub-agents/plugins/mcp-fetcher.ts`

Validation:
- `npm run test -- tests/unit/cohort-monitor-sub-agent.test.ts tests/unit/api-fetcher-sub-agent.test.ts tests/unit/mcp-fetcher-sub-agent.test.ts tests/unit/execute-routing.test.ts`
- Result: `15/15` passed.

### Plan 79: Admin UI route browser for current DB-backed learned routes

Status: Implemented in UI and verified.

What changed:
- Upgraded the admin UI route list into an administrator-focused route browser.
- Added a visible route source indicator driven by `/admin/health` so the UI shows whether learned routes are currently coming from:
  - Postgres / DB-backed store
  - JSON fallback
- Expanded the routes table with richer operational fields:
  - workflow type
  - last used timestamp
  - target
  - match-pattern preview
- Added route inspection workflow:
  - selecting a route now loads full details from `/admin/routes/:routeId`
  - human-readable details panel
  - collapsible raw JSON payload for exact route inspection

Files:
- `admin/public/index.html`
- `admin/public/app.js`
- `docs/ai-coding-plans/codex-plan-79.md`

Validation:
- `node --check admin/public/app.js`
- `npm run test -- tests/unit/admin-routes.test.ts`
- local smoke check: `admin/server.mjs` served the updated page successfully at `http://localhost:4174`

### Plan 80: Usage guide documentation for `ADMIN_API_TOKEN`

Status: Implemented in docs.

What changed:
- Expanded `docs/usage-guide.md` to explain how `ADMIN_API_TOKEN` works.
- Added:
  - token generation example (`openssl rand -hex 32`)
  - `.env` setup example
  - explanation of the auth flow (`ADMIN_ALLOWED_IPS` vs bearer token)
  - direct `curl` example for `/admin/routes`
  - admin UI setup steps showing that the UI token field expects the raw token value

### Plan 76: Deterministic synthesis-subtask skip for single-route prompts

Status: Implemented in code and tests.

What changed:
- `pipeline-think` now prunes redundant synthesis-only `general`/`assistant` subtasks when cognition produced exactly one deterministic route subtask (`mcp-fetcher`, `api-fetcher`, or `cohort-monitor`) and the synthesis task only depends on that deterministic task.
- `pipeline-execute` now has a runtime safety guard that skips redundant synthesis subtasks if they still appear, returning a deterministic synthetic completion record (`modelUsed: deterministic-skip`) instead of calling a model.
- This keeps output shape intact while removing unnecessary long-running synthesis calls in deterministic single-route flows.

Tests added:
- `tests/unit/think-deterministic-optimization.test.ts`
- Added skip-helper coverage in `tests/unit/execute-fast-path.test.ts`

Validation benchmark:
- Prompt: `How many API calculations have I used this month?`
- Before (baseline `run_cmmm07ara00573annlempsi2z`):
  - `pipeline-execute`: `41,368ms`
- After (optimized `run_cmmm22vpw00693ann1avwcxn1`):
  - `pipeline-execute`: `3,184ms`
- Net execute-stage reduction: ~`92.3%`.

### Plan 57: Autonomous Skill Self-Learning (No HITL for Skills)

Status: Implemented in code and tests.

What changed:
- Skill candidate lifecycle is now autonomous for skill creation:
  - `requiresApproval` defaults to `false` in skill schemas/parsers.
  - Agency suggestions are persisted as autonomous candidates.
- Added deterministic skill-file materialization using `skills/universal-agent-skill-creator.md`:
  - `src/trigger/universal-skill-creator.ts` now writes/updates skill files in `./skills/learned`.
  - Supports safe path normalization and skips overwriting manually maintained skill files.
- Agency execution now auto-materializes suggested skills:
  - `pipeline-execute` persists suggestions and materializes files immediately.
  - Materialization metadata is returned via `agencyResult.skillMaterializations`.
- Think stage now has deterministic self-learning augmentation:
  - Prompt is matched against candidate trigger patterns.
  - If matched candidate skill file is missing, think prepends a `skill-creator` subtask before other subtasks.
  - If skill file exists, no extra skill-creation subtask is injected.
- Cognition/Agency human-readable prompt docs updated to reflect autonomous no-HITL skill lifecycle.

Tests added/updated:
- `tests/unit/autonomous-skill-loop.test.ts`
  - skill file materialization + idempotent unchanged behavior
  - cognition autonomous skill-task injection
  - execute-stage suggestion persistence + materialization behavior
- `tests/unit/skill-candidates-store.test.ts`
  - best-candidate prompt matching
  - materialized flag in summary
- Updated skill-candidate cognition injection expectations in:
  - `tests/unit/cognition-skill-candidates.test.ts`

### Plan 59: Learned Skill Folder Split (`./skills/learned`)

Status: Implemented in code and tests.

What changed:
- Autonomous/on-the-fly skills are now normalized and materialized under `./skills/learned` only.
- `src/trigger/universal-skill-creator.ts` now enforces `skills/learned/*.md` destinations even if legacy root paths are suggested.
- `src/routing/skill-candidates-schema.ts` + `src/routing/skill-candidates-store.ts` default skill paths now point to `skills/learned/new-agent-skill.md`.
- `pipeline-execute` now persists candidate file paths using post-normalization materialization outputs.
- Existing learned skill files moved from `skills/*.md` to `skills/learned/*.md`.
- `knowledge/skill-candidates.json` path entries migrated to `skills/learned/...`.
- Human-readable prompts/spec docs updated to distinguish static skill files vs learned skill files.

Tests updated:
- `tests/unit/autonomous-skill-loop.test.ts`
- `tests/unit/universal-skill-creator.test.ts`
- `tests/unit/skill-candidates-store.test.ts`
- `tests/unit/cognition-skill-candidates.test.ts`
- `tests/unit/agency-skill-suggestions.test.ts`

### Plan 60: Learned Routes DB + Admin Observability

Status: Implemented in code and tests.

What changed:
- Added Postgres + Drizzle data model for learned-route persistence:
  - `src/routing/learned-routes-db-schema.ts`
  - `src/routing/learned-routes-db-repository.ts`
  - Tables:
    - `learned_routes`
    - `learned_route_events`
- Added env-driven storage/auth configuration:
  - `DATABASE_URL`
  - `LEARNED_ROUTES_DUAL_WRITE_JSON`
  - `ADMIN_ALLOWED_IPS`
  - `ADMIN_API_TOKEN`
  - (documented in `.env.example`)
- Refactored learned-routes store to support DB-authoritative mode:
  - `src/routing/learned-routes-store.ts`
  - `load()` is now async and DB-backed when `DATABASE_URL` is set.
  - in-memory cache retained for route matching performance.
  - optional JSON dual-write on DB mode via `LEARNED_ROUTES_DUAL_WRITE_JSON=true`.
  - usage/match/update events are recorded into `learned_route_events` when DB mode is enabled.
- Added migration/backfill utilities:
  - `src/routing/learned-routes-migration.ts`
  - `scripts/learned-routes-backfill.ts`
  - npm scripts:
    - `npm run routes:backfill`
    - `npm run routes:export`
- Added protected admin API:
  - `src/admin/auth.ts`
  - `src/admin/routes.ts`
  - wired into `src/index.ts` under `/admin/*`
  - supports route CRUD, route/event observability, run summary, and import/export operations.
- Added separate admin app scaffold:
  - `admin/server.mjs`
  - `admin/public/index.html`
  - `admin/public/app.js`
  - `admin/README.md`

Tests added/updated:
- Added:
  - `tests/unit/admin-auth.test.ts`
  - `tests/unit/admin-routes.test.ts`
  - `tests/unit/learned-routes-migration.test.ts`
- Updated:
  - `tests/unit/learned-routes-store.test.ts` (async load/add/increment paths)

### Plan 56: Mapp Intelligence API Workflows + `api-fetcher` skill preflight

Status: Implemented in code and tests.

What changed:
- Extended learned-route schema with API workflow metadata:
  - `apiWorkflow.workflowType`: `single-request | analysis-query | report-query`
  - `apiWorkflow.requestBodySource`
  - `apiWorkflow.poll` (`intervalMs`, `maxAttempts`)
  - `apiWorkflow.resultSelection` (`all-success | first-success`)
- Added template-backed API routes in `knowledge/learned-routes.json`:
  - `mapp-intelligence-cohort-performance-report` (report template)
  - `mapp-intelligence-channel-performance-analysis` (analysis template)
  - `mapp-intelligence-daily-report-global` (report template)
- Refactored `api-fetcher` into workflow engine:
  - `single-request` (existing behavior)
  - `analysis-query` (create -> optional poll -> analysis-result)
  - `report-query` (create -> poll report state -> collect success calculationIds -> fetch aggregated results)
  - compact metadata output for Agency aggregation (`workflowType`, `preflight`, compact result summaries)
- Implemented auth behavior in `api-fetcher`:
  - uses `MAPP_ANALYTICS_API_TOKEN` bearer token
  - on 401 for Mapp endpoints: refresh once via OAuth client-credentials (Basic auth) and retry once
  - refreshed token is runtime-only (not persisted to `.env`)
- Integrated deterministic preflight from `skills/mcp-builder-SKILL.md` for API routes executed by `api-fetcher`:
  - preflight diagnostics included in output metadata
  - MCP routes remain unchanged (`mcp-fetcher` path)
- Reinforced MCP-first routing tie-break in learned-route selection:
  - tie score preference: `sub-agent:mcp-fetcher` > other `sub-agent` > API routes
- Updated cognition knowledge/prompt docs to document split:
  - MCP prompts stay on `mcp-fetcher`
  - report-template intelligence prompts go to `api-fetcher`
- Updated usage guide prompt pack with expected route targets for both API-template and MCP prompts.

Tests added/updated:
- `tests/unit/api-fetcher-workflows.test.ts`
  - analysis-query direct calculation path
  - analysis-query polling path
  - analysis-query polling timeout path
  - report-query aggregation path
  - malformed `requestBodySource` path
  - 401 -> token refresh -> retry path
  - refresh failure deterministic failure payload
- `tests/unit/learned-routes-store.test.ts`
  - MCP-first tie-break when match scores tie
  - summary includes `workflowType` metadata for template-backed routes
- `tests/unit/mapp-intelligence-contracts.test.ts`
  - required Postman endpoints present in `ref/intelligence-postman-collection.json`
  - all learned API `requestBodySource` files exist and parse as JSON
  - route capability contracts for cohort/channel/daily templates

### Fixed: MCP route occasionally executing via `api-fetcher`

**User-visible symptom**
- Prompt: `What segments are defined in my Mapp Intelligence account?`
- Expected route target: `route-006` (`sub-agent:mcp-fetcher`)
- Intermittent runtime behavior: execution used `api-fetcher`.

**Root cause**
- In `pipeline-execute`, when Cognition emitted a **registered** agent (`api-fetcher`), execution trusted it directly.
- Learned-route target remapping was only applied in the fallback path for unknown agents.
- Result: Cognition could emit `api-fetcher` even when learned route target was `sub-agent:mcp-fetcher`.

**Implemented fix**
- Added deterministic route-target resolver:
  - `src/trigger/route-target-resolution.ts`
- Updated `src/trigger/execute.ts` to:
  - resolve learned route by `routeId` (or capability match),
  - deterministically override conflicting registered `agentId` to learned route target,
  - keep `api-fetcher` usage tied to `routeType: "api"`,
  - log override events for traceability.
- Added API input normalization helper for deterministic `api-fetcher` dispatch.

**Cognition human-readable spec updates**
- Updated:
  - `knowledge/agents/cognition/system-prompt.md`
  - `knowledge/agents/cognition/decision-logic.md`
- Added explicit policy:
  - learned route target is authoritative,
  - `sub-agent:mcp-fetcher` must stay `mcp-fetcher`,
  - `api-fetcher` only for `api:*` targets.

**Tests added**
- `tests/unit/route-target-resolution.test.ts`
  - conflicting registered agent override to learned sub-agent target
  - no override when already matching
  - api route mapping to `api-fetcher`
  - no override when learned target unregistered or route missing

**Test runs**
- Passed:
  - `tests/unit/route-target-resolution.test.ts`
  - `tests/unit/cognition-agent.test.ts`
  - `tests/unit/learned-route-input-hydration.test.ts`
  - `tests/unit/mcp-fetcher.test.ts`
  - `tests/unit/api-fetcher-sub-agent.test.ts`
  - `tests/unit/execute-routing.test.ts`
- `npm run build` currently fails due pre-existing generic type constraints in:
  - `src/trigger/think.ts`
  - `src/trigger/execute.ts`
  - `src/trigger/deliver.ts`
  (not introduced by this change set).

### Added: Agency-to-Cognition Skill Feedback Loop

**Goal**
- Capture reusable workflow recommendations from Agency and feed them back into Cognition for future prompts.

**Implemented**
- Added structured `skillSuggestions` support:
  - `src/core/types.ts` (`AgencyResult.skillSuggestions`)
  - `knowledge/agents/agency/system-prompt.md`
  - `src/agents/agency-agent.ts` fallback prompt
- Added persistent store:
  - `src/routing/skill-candidates-schema.ts`
  - `src/routing/skill-candidates-store.ts`
  - `knowledge/skill-candidates.json`
- Added execute-stage persistence:
  - `src/trigger/agency-skill-suggestions.ts`
  - `src/trigger/execute.ts` parses and upserts valid suggestions into `knowledge/skill-candidates.json`.
- Added cognition-stage feedback injection:
  - `src/agents/cognition-agent.ts` now injects `SKILL_CANDIDATES_SECTION`.
  - `knowledge/agents/cognition/system-prompt.md` + `decision-logic.md` updated for candidate reuse policy.
- Added deterministic execution for skill-creator tasks:
  - `src/trigger/execute.ts` now routes `agentId` aliases (`skill-creator`, `skill_creator`, `universal-skill-creator`) directly to universal skill creator workflow.
- Orchestrator now reloads candidate file each run:
  - `src/trigger/orchestrate.ts`

**Tests added**
- `tests/unit/agency-skill-suggestions.test.ts`
- `tests/unit/skill-candidates-store.test.ts`
- `tests/unit/cognition-skill-candidates.test.ts`

**Test run**
- Passed:
  - `tests/unit/agency-skill-suggestions.test.ts`
  - `tests/unit/skill-candidates-store.test.ts`
  - `tests/unit/cognition-skill-candidates.test.ts`
  - `tests/unit/cognition-agent.test.ts`

---

## What Has Been Implemented (DONE)

### 1. Full 4-Stage Pipeline (Working)
- All 4 guardrail stages run end-to-end via Trigger.dev
- Model fallback across 3 providers (Anthropic, OpenAI, Google)
- Env-driven model configuration (`.env` → `MODEL_*` and `AGENT_*_MODELS` vars)

### 2. Sub-Agent Plugin System (Working)
- `BaseSubAgent` → `SubAgentRegistry` → auto-registration on import
- `cohort-monitor` plugin with mock data service (happy/sad paths)
- `api-fetcher` plugin for executing learned API routes
- Input normalization in registry (handles string, null, object inputs)

### 3. Notification System (Working)
- Slack (`@slack/web-api`), Email (SendGrid), Webhook (HMAC-signed)
- Channel adapter pattern with registry

### 4. Slack Integration (Working)
- Bot token configured, `chat:write` works
- `conversations.replies()` is now confirmed working
- Slack thread-read path is operational for escalation and route-learning polling

### 5. Human-in-the-Loop Escalation (Code Complete, Runtime Verified)
**Files:**
- `src/escalation/slack-escalation.ts` — Send Block Kit message, poll thread replies, parse approve/reject
- `src/trigger/escalate.ts` — Trigger.dev task wrapping the escalation flow

**How it works:**
1. Send rich Block Kit message to Slack with instructions
2. Poll `conversations.replies()` every 30 seconds
3. Parse "approve"/"yes"/"lgtm" → approved; "reject"/"no"/"deny" → rejected
4. Post confirmation in thread
5. Return `EscalationResult` to caller

**Status:** Runtime verified for send + thread polling + timeout path.

### 6. Smart Fallback Router (Code Complete, Runtime Verified)
**Files:**
- `src/routing/learned-routes-schema.ts` — Zod schemas
- `src/routing/learned-routes-store.ts` — Singleton store (load/save/find/add from `knowledge/learned-routes.json`)
- `src/routing/route-learning-escalation.ts` — Slack HITL for learning API endpoints
- `src/trigger/learn-route.ts` — Trigger.dev task for route learning
- `src/trigger/sub-agents/plugins/api-fetcher.ts` — Sub-agent executing learned routes
- `knowledge/learned-routes.json` — Human-readable route storage (contains verified learned route entries)

**How it works:**
1. When a subtask has no matching sub-agent (falls back to "general"):
   - Check `knowledge/learned-routes.json` for a matching learned route
   - If found → dispatch to `api-fetcher` sub-agent (direct HTTP fetch)
   - If not → trigger Slack HITL asking marketer for API endpoint URL
   - Save learned route to JSON file for future use
   - If Slack times out → fall back to generic LLM response
2. Future requests: Cognition agent sees learned routes in its system prompt → assigns `api-fetcher` directly

**Status:** Runtime verified for timeout/fallback path and interactive URL-reply learn/save path.

---

## What Needs to Be Done Next

### Slack Scope Blocker (Resolved)
- `channels:history` + thread polling path has been validated in runtime (`chat.postMessage` + `conversations.replies` both working).
- No remaining blocker on Slack permissions.

### Testing (Current)

#### Human-in-the-Loop Escalation
1. `escalateTask` is wired into orchestrator failure paths.
2. Verified task runtime with short timeout:
   - Run: `run_v1ubh945p3xf1z51csj2n`
   - Output: timed out cleanly with `slackThreadTs` returned.
3. Interactive non-timeout path verified:
   - Run: `run_39d3r95oca4fn4y3vodgs`
   - Output: rejected decision captured with `decidedBy` and `timedOut: false`

#### Smart Fallback Router
1. Verified `learn-route` runtime with short-timeout test:
   - Run: `run_mkfq2u68m9hbuwng2wykj`
   - Output: `{ learned: false, fallbackUsed: true }` (expected timeout/fallback path).
2. Verified direct Slack send helpers after channel fallback patch:
   - Escalation helper send: success to channel `C0AJUTFJYKX`
   - Route-learning helper send: success to channel `C0AJUTFJYKX`
3. Interactive URL-reply path verified:
   - Run: `run_ygi1s1cjj9wbcmssejshp`
   - Output: `{ learned: true, fallbackUsed: false }`
   - Route persisted to `knowledge/learned-routes.json`

### Potential Improvements
- **Integrate escalation into pipeline**: Add try/catch in `orchestrate.ts` to trigger `escalateTask` when a stage fails
- **Add more sub-agent plugins**: The `plugins/index.ts` has placeholders for journey-agent, consumer-insights, segment-agent, etc.
- **Persist memory**: Short-term and long-term memory are currently in-memory only — add Redis or SQLite backing
- **Production Slack setup**: Consider Socket Mode for environments without public URLs

---

## Post-Handover Progress (2026-03-06, Codex)

### Completed (non-blocked)
- Updated project-wide Slack fallback default channel:
  - Replaced hardcoded fallback `#marketing-alerts` with `#brand-cp-hitl`.
  - Applied across escalation, route-learning, delivery notifications, Slack adapter defaults, tests, and usage docs.
- Renamed HITL channel env vars to unified `SLACK_HITL_CHANNEL`:
  - Replaced dual usage of `MARKETER_SLACK_CHANNEL` + `SLACK_DEFAULT_CHANNEL` with `SLACK_HITL_CHANNEL` in `.env` and `.env.example`.
  - Updated escalation/route-learning/channel defaults to prefer `SLACK_HITL_CHANNEL` (with backward-compatible fallback to old vars).
  - Human-review routing now targets `SLACK_HITL_CHANNEL`; monitoring uses `SLACK_MONITORING_CHANNEL` then falls back to `SLACK_HITL_CHANNEL`.
- Added additional tests and docs for Slack alert-routing behavior:
  - `tests/unit/deliver-notifications.test.ts` now also covers:
    - monitoring channel fallback to `SLACK_HITL_CHANNEL`
    - no monitoring alert when there are no issues/failures
    - monitoring alert deduplication
  - `docs/usage-guide.md` now includes alert-routing validation prompts.
- Refactored delivery-stage Slack routing:
  - `needsHumanReview: true` now routes to `SLACK_HITL_CHANNEL`.
  - Issue monitoring now routes to `SLACK_MONITORING_CHANNEL` via deterministic fallback notification.
  - Monitoring triggers when:
    - `AgencyResult.issues` is non-empty, or
    - any subtask result has `success: false`.
  - Updated types with `AgencyResult.issues` and `AgencyResult.needsHumanReview`.
  - Added tests in `tests/unit/deliver-notifications.test.ts`.
  - Updated docs/env template to include `SLACK_MONITORING_CHANNEL`.
- Expanded `docs/usage-guide.md` prompt reference with test-derived examples:
  - learned-route matching sample
  - route-pattern matching sample
  - in-scope cognition sample
  - LLM fallback sample
  - competitor/non-marketing guardrail rejection samples
- Added prompt reference section to `docs/usage-guide.md`:
  - Mapp MCP prompt examples for:
    - dimensions/metrics catalog
    - page impressions (last 7 days)
    - segment listing
    - monthly API calculations usage
  - Additional cohort-monitor trigger prompts for retention/churn/conversion/engagement scenarios.
- Updated `docs/usage-guide.md` with out-of-scope cognition guardrail documentation:
  - Added new section: "Out-of-Scope Requests"
  - Documented early-stop behavior and rejection/acceptance example prompts.
- Added cognition-stage rejection guardrail for out-of-scope requests:
  - `src/trigger/cognition-guardrails.ts` introduces deterministic rejection for:
    - competitor/rival-focused asks
    - clearly non-marketing asks (e.g. weather/recipe/sports/politics)
  - `src/agents/cognition-agent.ts` prompt now instructs model to return:
    - `rejected: true`
    - `rejectionReason`
    - no subtasks
  - `src/trigger/think.ts` now enforces guardrail fallback even if model output is malformed.
  - `src/trigger/orchestrate.ts` now stops the pipeline after cognition when rejected (skips agency/interface) and returns the rejection message directly.
  - Added tests in `tests/unit/cognition-guardrails.test.ts`.
- Beautified assistant final response rendering for markdown-style outputs in demo:
  - `demo/app.js` now renders final `formattedResponse` as markdown-like DOM (headings, bullets, bold, inline code, paragraphs).
  - `demo/styles.css` now styles markdown blocks for readable chat presentation.
  - JSON extraction behavior remains in place before markdown rendering.
- Upgraded demo trace rendering for JSON-heavy stage outputs:
  - `demo/app.js` now detects JSON (including fenced ```json blocks) in trace action/reasoning fields.
  - JSON values are rendered as collapsible object/array trees with nested expand/collapse.
  - Plain text still renders unchanged.
  - `demo/styles.css` updated with readable JSON key/value styling.
- Improved demo assistant readability for raw JSON responses:
  - Updated `demo/app.js` to normalize final assistant text.
  - If `formattedResponse` contains raw JSON or fenced ```json output, the UI now extracts and renders only the human-readable `formattedResponse` field.
- Fixed large MCP payload failures in `pipeline-execute` (Trigger.dev `Failed to generate presigned URL`):
  - `src/trigger/sub-agents/plugins/mcp-fetcher.ts` now compacts oversized tool output before returning.
  - For `list_dimensions_and_metrics`, output is normalized to names-only arrays plus counts.
  - Generic oversized outputs are truncated with metadata (`originalSizeChars`, `preview`, `note`).
  - Added test coverage in `tests/unit/mcp-fetcher.test.ts`.
- Fixed missing Slack alerts when pipeline output requires human review:
  - Added `src/trigger/deliver-notifications.ts` fallback logic.
  - `pipeline-deliver` now ensures `needsHumanReview: true` produces at least one Slack notification.
  - Recipient resolution uses:
    - `SLACK_HITL_CHANNEL`
  - Added tests in `tests/unit/deliver-notifications.test.ts`.
- Fixed MCP config failure for learned routes targeting `serverName: "mapp-michel"`:
  - `src/tools/mcp-client.ts` now supports both stdio and HTTP MCP transports.
  - Added automatic env-based registration for `mapp-michel` using:
    - `MAPP_MCP_SERVER_MICHEL_URL`
    - `MAPP_MCP_SERVER_MICHEL_TOKEN`
  - HTTP transport includes required header: `Accept: application/json, text/event-stream`.
  - This removes the need to manually define `mapp-michel` inside `MCP_SERVERS`.
- Added MCP-learned-route coverage for key Mapp Intelligence questions in `knowledge/learned-routes.json`:
  - Converted route for dimensions/metrics listing to MCP (`list_dimensions_and_metrics`)
  - Added page impressions (last 7 days) route via MCP `run_analysis`
  - Added segments listing route via MCP `list_segments`
  - Added monthly API calculations usage route via MCP `get_analysis_usage`
  - All above use `routeType: "sub-agent"`, `agentId: "mcp-fetcher"`, and `serverName: "mapp-michel"`
- Verified remote MAPP MCP server connectivity using env credentials:
  - Endpoint: `MAPP_MCP_SERVER_MICHEL_URL` + `/api/mcp`
  - Auth: `Bearer` token from `MAPP_MCP_SERVER_MICHEL_TOKEN`
  - Requirement discovered: requests must include `Accept: application/json, text/event-stream`
  - Results:
    - `initialize` returned HTTP 200 with server info
    - `tools/list` returned HTTP 200 with available tools
    - `tools/call` for `list_dimensions_and_metrics` returned HTTP 200 with metrics/dimensions payload
- Updated git ignore rules for Trigger local artifacts:
  - Added explicit `.trigger` entry in `.gitignore` (alongside existing `.trigger/`).
- Untracked local Claude settings file from git index:
  - `.claude/settings.local.json` removed from version control via `git rm --cached`
  - File remains local and is now ignored by `.gitignore`
- Added failure-path escalation triggers in `src/trigger/orchestrate.ts`:
  - If Grounding/Cognition/Agency/Interface task returns failure, pipeline now triggers `escalate-to-human` (fire-and-forget) with stage metadata and then still fails the run.
  - Escalation trigger failures are logged and do not mask the original stage error.
- Added deterministic strategy helper for unknown subtask routing:
  - `src/trigger/execute-routing.ts`
  - Strategy order: learned route → learn new route (data-like tasks) → LLM fallback.
- Updated `src/trigger/execute.ts` to use the shared strategy helper.
- Added non-Slack unit tests:
  - `tests/unit/execute-routing.test.ts`
  - `tests/unit/route-learning-parser.test.ts`
  - `tests/unit/learned-routes-store.test.ts` (restores `knowledge/learned-routes.json` after test run)
- Added Slack channel fallback behavior in both senders:
  - `src/escalation/slack-escalation.ts`
  - `src/routing/route-learning-escalation.ts`
  - If first configured channel is invalid (`channel_not_found`), sender now tries the next configured channel.
- Verified blocked runtime paths:
  - Scope probe success (`chat.postMessage` + `conversations.replies`)

## Post-Handover Progress (2026-03-09, Codex)

### Completed
- Fixed model-output JSON parsing fragility across pipeline stages:
  - Added `src/trigger/agent-output-parser.ts` with tolerant parsing for:
    - plain JSON output
    - markdown fenced JSON blocks (for example, ```json ... ```)
    - JSON embedded after explanatory text
- Refactored stage parsing to use the shared parser:
  - `src/trigger/think.ts`
  - `src/trigger/execute.ts`
  - `src/trigger/deliver.ts`
- Result of the fix:
  - Cognition no longer falls back to default general subtask only because output is fenced JSON.
  - Agency preserves structured fields (`issues`, `needsHumanReview`) when summary is fenced JSON.
  - Interface preserves structured delivery payload (`formattedResponse`, `notifications`) when output is fenced JSON.
  - Monitoring/HITL fallback notifications can now trigger correctly from preserved agency fields.

### Tests
- Added unit test suite for parser behavior:
  - `tests/unit/agent-output-parser.test.ts`
  - Covers plain JSON, fenced JSON, embedded JSON, and non-JSON fallback.
- Verification run:
  - `npm test`
  - Result: `12` test files passed, `67` tests passed.

### Planning Artifact
- Added implementation plan file:
  - `docs/ai-coding-plans/codex-plan-28.md`

### Additional Fix (2026-03-09): Learned Route Defaults for Registered Sub-Agents
- Root cause addressed:
  - When Cognition directly assigned a registered sub-agent (for example `mcp-fetcher`), Agency executed it directly and skipped learned-route default hydration.
  - This caused missing required `mcp-fetcher` fields (`serverName`, `toolName`) even though they existed in `knowledge/learned-routes.json` (route-007).
- Implemented deterministic hydration in Agency:
  - Added `src/trigger/learned-route-input-hydration.ts`.
  - `src/trigger/execute.ts` now hydrates registered sub-agent input from learned route defaults by:
    - `routeId` in subtask input, or
    - description-based learned-route match.
  - Defaults are applied only when learned route target matches the same sub-agent.
- Added defensive fallback in MCP fetcher:
  - `src/trigger/sub-agents/plugins/mcp-fetcher.ts` now hydrates input from learned route defaults (via `routeId`) before schema validation.
  - This prevents hard failures when Cognition omits required fields but supplies route reference.
- Prompt guidance improved:
  - `src/agents/cognition-agent.ts` learned-route hints now explicitly instruct sub-agent route input to include:
    - `{ "routeId": "<route-id>", ... }`
- Tests added:
  - `tests/unit/learned-route-input-hydration.test.ts`
  - `tests/unit/mcp-fetcher.test.ts` expanded with route-default hydration case
- Verification:
  - `npm test` passed (`13` files, `71` tests).
  - Live E2E prompt re-test:
    - Prompt: `List all available dimensions and metrics in Mapp Intelligence`
    - Run: `run_c29xop2g14w6fxxjypqha`
    - Result: completed successfully via route-007 + `mcp-fetcher`; no missing `serverName/toolName` validation error.

### Additional Fix (2026-03-09): Preserve Critical Agency Facts in Final Interface Output
- Root cause addressed:
  - The final assistant response used only Interface summarization, which could compress/omit detailed Agency findings.
- Implemented delivery fidelity layer:
  - Added `src/trigger/delivery-fidelity.ts`:
    - `extractCriticalFacts()` gathers high-signal facts (metrics, time window, ranked findings, issues) from Agency summary + subtask outputs.
    - `buildHumanReadableRenderRequirements()` builds readable rendering requirements from Grounding guardrails (`alwaysDo`) plus Cognition plan context.
    - `enforceCriticalFactsInResponse()` appends missing critical facts under a human-readable markdown section (`## Detailed Findings`).
- Pipeline changes:
  - `src/trigger/deliver.ts`
    - Passes `criticalFacts`, `renderRequirements`, `issues`, `needsHumanReview`, and cognition context into Interface input.
    - Applies deterministic post-check to prevent dropping critical facts.
  - `src/trigger/orchestrate.ts`
    - Now passes `cognitionResult` to `pipeline-deliver`.
  - `src/agents/interface-agent.ts`
    - Prompt now explicitly requires readable markdown sections and preserving `criticalFacts`.
- Tests:
  - Added `tests/unit/delivery-fidelity.test.ts` for fact extraction, human-readable requirements, and missing-fact appendix behavior.
  - `npm test` passed (`14` files, `74` tests).
  - Live verification:
  - Prompt: `Show me my page impressions for the last 7 days`
  - Run: `run_i6crxc4d64buk8j6j4tof`
  - Result: final response now includes structured sections (`Executive Summary`, `Key Findings`, table + metrics) with Agency-level detail retained.

### Additional Fix (2026-03-09): Demo Markdown Table Rendering
- Root cause addressed:
  - Demo markdown renderer handled headings/lists/paragraphs but not markdown tables, so `| ... |` blocks rendered as raw text.
- Implemented in UI:
  - `demo/app.js`
    - Added markdown table parser for GitHub-style tables (header row + separator row + body rows).
    - Table parsing is evaluated before paragraph fallback, preventing table lines from being merged into plain text.
  - `demo/styles.css`
    - Added `.md-table-wrap` and `.md-table` styles with readable header/body formatting and horizontal overflow support.
- Validation:
  - `node --check demo/app.js`
  - `npm test` (full suite) passed (`14` files, `74` tests).

### Additional Fix (2026-03-10): Filter Raw JSON From Detailed Findings
- Root cause addressed:
  - Delivery fidelity extraction was treating serialized MCP/tool payload lines as critical facts, causing raw JSON blobs to appear in the final `Detailed Findings`.
- Implemented in `src/trigger/delivery-fidelity.ts`:
  - Added machine-payload detection (`isLikelyMachinePayload`) to exclude lines matching tool-envelope JSON patterns (e.g. `serverName`, `toolName`, `args`, `queryObject`, `rows`, `headers`).
  - Added max fact-line length guard to skip oversized unreadable payload lines.
  - Updated critical-fact matcher to reject machine payloads before relevance checks.
- Regression coverage:
  - `tests/unit/delivery-fidelity.test.ts` now includes MCP-style raw JSON payload and asserts it is excluded from extracted facts while human-readable findings remain.
- Validation:
  - `npm test` passed (`14` files, `75` tests).

### Additional Fix (2026-03-10): Split Admin vs Marketer Slack Routing
- Root cause addressed:
  - Notification fallback logic previously routed most issues to admin channels and treated `needsHumanReview` too broadly, causing admin HITL alerts for marketer-facing monitoring cases.
- Refactor implemented:
  - `src/trigger/deliver-notifications.ts`
    - Added channel separation:
      - `SLACK_HITL_CHANNEL` → admin human-review escalation only.
      - `SLACK_MONITORING_CHANNEL` → admin/system failure monitoring (failed subtasks).
      - `SLACK_MARKETERS_MONITORING_CHANNEL` → marketer-facing monitoring issues/warnings.
    - Added stricter HITL escalation gate:
      - requires `needsHumanReview: true` plus either failed subtask or critical issue keywords.
    - Added `normalizeSlackNotificationRecipients()` to rewrite Interface-generated Slack recipients deterministically based on severity/category.
  - `src/trigger/deliver.ts`
    - Applies notification normalization before fallback appends.
    - Ensures marketer monitoring fallback channel is added for marketer-facing issues.
  - `src/agents/interface-agent.ts`
    - Prompt updated to distinguish marketer monitoring vs admin monitoring vs admin HITL.
- Config/docs:
  - `.env.example` now includes `SLACK_MARKETERS_MONITORING_CHANNEL`.
  - `docs/usage-guide.md` updated with revised channel-routing rules.
- Tests:
  - Expanded `tests/unit/deliver-notifications.test.ts` with new routing behavior and normalization coverage.
  - Full suite passed: `14` files, `80` tests.

### Additional Fix (2026-03-10): Admin/Marketer Env Var Rename + HITL Split
- Renamed Slack admin variables across runtime/config/docs:
  - `SLACK_HITL_CHANNEL` -> `SLACK_ADMIN_HITL_CHANNEL`
  - `SLACK_MONITORING_CHANNEL` -> `SLACK_ADMIN_MONITORING_CHANNEL`
- Added marketer HITL channel variable:
  - `SLACK_MARKETERS_HITL_CHANNEL`
- Routing behavior now:
  - Marketer human review (non-admin severity) -> `SLACK_MARKETERS_HITL_CHANNEL`
  - Admin human review (critical/failure escalation) -> `SLACK_ADMIN_HITL_CHANNEL`
  - Marketer monitoring issues -> `SLACK_MARKETERS_MONITORING_CHANNEL`
  - Admin/system monitoring failures -> `SLACK_ADMIN_MONITORING_CHANNEL`
- Updated files:
  - `.env`, `.env.example`
  - `src/trigger/deliver-notifications.ts`, `src/trigger/deliver.ts`, `src/agents/interface-agent.ts`
  - `src/channels/slack-channel.ts`, `src/escalation/slack-escalation.ts`, `src/routing/route-learning-escalation.ts`
  - `tests/unit/deliver-notifications.test.ts`
  - `docs/usage-guide.md`
- Validation:
  - `npm test` passed (`14` files, `83` tests).

### Additional Docs Update (2026-03-10): Test-backed Prompt Matrix
- Updated `docs/usage-guide.md` with a dedicated notification-routing prompt matrix aligned to current unit-test scenarios:
  - marketer HITL prompt
  - admin HITL prompt
  - marketer monitoring prompt
  - admin monitoring prompt
  - no-alert success prompt
- This section is intended for fast manual validation after config changes in `.env`.

### Additional Fix (2026-03-10): Agency MCP-Builder Skill Branch
- Added Agency-side API/MCP builder intent routing:
  - `src/trigger/mcp-builder.ts`
    - Detects MCP-builder style subtasks (API integration / create MCP server intents).
    - Loads and uses `skills/mcp-builder-SKILL.md` to generate structured implementation guidance.
    - Returns Agency-compatible result output with workflow phases, required inputs, and next steps.
  - `src/trigger/execute.ts`
    - For unknown agent subtasks with no learned route, routes API/MCP builder intents to the MCP-builder branch instead of generic fallback.
    - Existing learned-route and registered sub-agent behavior remains unchanged.
- Tests added:
  - `tests/unit/mcp-builder.test.ts`
    - intent detection positive/negative cases
    - guidance structure validation
    - Agency-compatible result validation
- Docs updated:
  - `docs/usage-guide.md` now includes MCP-builder trigger prompts.
- Validation:
  - `npm test` passed (`15` files, `87` tests).

### Additional Fix (2026-03-10): Universal Skill-Creator Across Agents/Sub-Agents
- Added universal skill-creator workflow module:
  - `src/trigger/universal-skill-creator.ts`
  - Detects skill-creation intent and returns structured guidance based on `skills/universal-agent-skill-creator.md`.
  - Guidance explicitly targets `./skills/learned` as destination for autonomous learned skills.
- Agency routing update:
  - `src/trigger/execute.ts` now routes unknown subtasks with skill-creation intent to universal skill-creator workflow before generic fallback.
- Prompt-level behavior update across agents and sub-agents:
  - Main agents updated (`grounding`, `cognition`, `agency`, `interface`) to explicitly recommend creating reusable skills via `./skills/universal-agent-skill-creator.md` and storing learned skills under `./skills/learned`.
  - Sub-agent base class adds shared skill-creation instruction helper.
  - Sub-agent prompts updated (`cohort-monitor`, `api-fetcher`, `mcp-fetcher`) to include this instruction.
- Tests added:
  - `tests/unit/universal-skill-creator.test.ts`
    - intent detection
    - guidance structure
    - destination folder assertions
    - Agency-compatible result output
- Usage docs updated:
  - Added universal skill-creator prompts in `docs/usage-guide.md`.
- Validation:
  - `npm test` passed (`16` files, `91` tests).
  - `escalate-to-human` timeout path verified end-to-end
  - `learn-route` fallback path verified end-to-end
- Verified interactive runtime paths:
  - `escalate-to-human` non-timeout human decision path (`run_39d3r95oca4fn4y3vodgs`)
  - `learn-route` interactive URL reply path with persisted route (`run_ygi1s1cjj9wbcmssejshp`)
- Fixed learned-routes persistence for Trigger worker runtime:
  - `src/routing/learned-routes-store.ts` now resolves project root robustly (handles `.trigger` worker execution context)
  - Added directory creation before writing learned routes
- Added a standalone marketer demo chat app in `demo/`:
  - `demo/index.html`, `demo/styles.css`, `demo/app.js`
  - `demo/server.mjs` static server
  - `demo/README.md` run instructions
  - npm script: `npm run demo`
  - Demo features:
    - marketer chat input and session continuity
    - pipeline run status updates while waiting
    - final response rendering
    - visible step-by-step execution trace (phase/action/reasoning/duration)
- Demo reliability fix:
  - Updated demo default API base to `http://localhost:3001` (common backend port in this repo setup)
  - Added auto-detection between `localhost:3001` and `localhost:3000` via `/health`
  - Improved UI error messages to include the exact endpoint used (helps diagnose 405/misrouting quickly)
- Routing hardening fix for VIP/cohort questions:
  - Root cause observed: cognition occasionally produced non-JSON output; `think.ts` fallback previously forced `agentId: "general"`.
  - Side effect: `execute.ts` smart-router could match learned routes (e.g. `route-002`) and skip built-in cohort monitor.
  - Fixes implemented:
    - `think.ts`: parse-failure fallback now routes cohort-like requests to `cohort-monitor` with derived defaults.
    - `execute.ts` + `execute-routing.ts`: unknown cohort-like tasks now prefer `cohort-monitor` before learned-route matching.
    - Added regression tests in `tests/unit/execute-routing.test.ts`.
  - Verified with live run:
    - Prompt: \"How is our VIP cohort performing this quarter?\"
    - Cognition reasoning: \"Could not parse agent output, falling back to single cohort-monitor task\"
    - Agency result now uses `agentId: \"cohort-monitor\"` (not `general`).
- Learned-routes source-of-truth refactor:
  - Removed static cohort-specific routing safeguards.
  - `learned-routes.json` now supports route targets:
    - `routeType: \"api\"` (existing `api-fetcher` path)
    - `routeType: \"sub-agent\"` (direct plugin dispatch, e.g. `cohort-monitor`)
  - `execute.ts` now follows learned route target type as the routing source of truth for unknown tasks.
  - Added VIP cohort learned route entry as a `sub-agent` route in `knowledge/learned-routes.json`.
  - Verified live: prompt \"How is our VIP cohort performing this quarter?\" routed through learned route and executed `cohort-monitor` successfully.
- Added Mapp analytics learned-route coverage:
  - `knowledge/learned-routes.json` now includes multiple analytics API routes using env templates:
    - `{{MAPP_ANALYTICS_API_URL}}`
    - `{{MAPP_ANALYTICS_API_CLIENT_ID}}`
    - `{{MAPP_ANALYTICS_API_CLIENT_SECRET}}`
  - Added route capabilities for:
    - campaign performance
    - conversion funnel drop-off
    - channel attribution
    - segment performance
    - KPI trend analysis
  - Route matching remains keyword-driven; execution uses `api-fetcher` and template substitution at runtime.
- Added MCP-backed learned-route execution path:
  - New sub-agent plugin: `src/trigger/sub-agents/plugins/mcp-fetcher.ts`
  - Plugin registration updated in `src/trigger/sub-agents/plugins/index.ts`
  - Supports learned-route defaults for:
    - `serverName`
    - `toolName`
    - `args` with `{{input.*}}` and `{{ENV_VAR}}` template resolution
  - `mcp-fetcher` executes MCP tool calls directly (no LLM), with route usage tracking via `routeId`.
- Added MCP examples to learned routes:
  - `route-008` (`analytics-kpi-benchmark-via-mcp`) → `agentId: "mcp-fetcher"`
  - `route-009` (`analytics-retention-drivers-via-mcp`) → `agentId: "mcp-fetcher"`
- Added unit tests for MCP input mapping helpers:
  - `tests/unit/mcp-fetcher.test.ts`
- Updated docs:
  - `docs/usage-guide.md` now includes MCP learned-route configuration and runtime flow.

### Still pending
- Optional production hardening:
  - Set Slack channel env vars to channel IDs (e.g., `C...`) to avoid workspace name-resolution issues
  - Add integration tests around `learned-routes-store` path resolution under worker context

### Validation status
- `npm test`: passing
- `npx tsc --noEmit`: passing
- Slack scope probe (2026-03-06): `chat.postMessage` and `conversations.replies` both succeeded (channel `C0AJUTFJYKX`). Slack thread-read path is now working.

### Operational note
- Keep this file updated after each implementation batch so latest project status survives context resets.

---

## Environment Setup

### Prerequisites
- Node.js 18+
- Docker (for self-hosted Trigger.dev at `http://localhost:3040`)

### Environment Variables (`.env`)
Key variables (see `.env.example` for full list):
```
# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=AI...

# Model Configuration
MODEL_ANTHROPIC_FAST=claude-haiku-4-5
MODEL_ANTHROPIC_BALANCED=claude-sonnet-4-6
MODEL_OPENAI_FAST=gpt-4o-mini
MODEL_GOOGLE_FAST=gemini-2.5-flash

# Trigger.dev
TRIGGER_API_URL=http://localhost:3040
TRIGGER_SECRET_KEY=tr_dev_...
TRIGGER_PROJECT_REF=proj_...

# Slack
SLACK_BOT_TOKEN=xoxe.xoxp-...
SLACK_HITL_CHANNEL=#brand-cp-test
```

### Running
```bash
# Terminal 1: Trigger.dev (Docker must be running)
npx trigger dev

# Terminal 2: API server
npx tsx src/index.ts

# Terminal 3: Test
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"How is our VIP cohort performing?"}'

# Check status
curl http://localhost:3001/status/<runId>
```

---

## Key Technical Notes

### Trigger.dev v3 Specifics
- SDK: `@trigger.dev/sdk` v3.3.17, CLI: `trigger.dev@3`
- `wait.for({ seconds })` — time-based blocking only, no callback/token resumption
- `task.triggerAndWait()` — blocks until child task completes
- `task.trigger()` — fire-and-forget
- Tasks auto-discovered from `src/trigger/` directory
- Self-hosted at `http://localhost:3040` via Docker

### Model IDs (Current Working Versions)
- Anthropic: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`
- OpenAI: `gpt-4o-mini`, `gpt-4o`, `o3`
- Google: `gemini-2.5-flash`, `gemini-2.5-pro`

### Common Pitfalls
- **Zombie workers**: If runs get stuck in QUEUED, kill any zombie `node` processes consuming high CPU, then restart `npx trigger dev`
- **Orphaned queued runs after platform outage**: If `localhost:3040` goes down briefly, some runs may remain permanently `QUEUED`. Start a fresh worker and retrigger the request (new runs execute; old orphaned run can be ignored/canceled).
- **Model "Not Found"**: Use short model aliases (e.g., `claude-haiku-4-5` not `claude-haiku-4-5-20251001`)
- **CLI restart on code change**: The trigger CLI auto-restarts when it detects code changes, which cancels in-flight runs — wait for reload before triggering new runs

---

## File-by-File Reference

### Core Pipeline Tasks (`src/trigger/`)
| File | Task ID | Purpose |
|------|---------|---------|
| `orchestrate.ts` | `orchestrate-pipeline` | Top-level: Ground → Think → Execute → Deliver → Notify |
| `ground.ts` | `pipeline-ground` | Loads brand context from knowledge/soul.md + guardrails.md |
| `think.ts` | `pipeline-think` | Cognition: decomposes into subtasks |
| `execute.ts` | `pipeline-execute` | Agency: runs subtasks (smart fallback router here) |
| `deliver.ts` | `pipeline-deliver` | Interface: formats response |
| `notify.ts` | `pipeline-notify` | Sends notifications via channel adapters |
| `escalate.ts` | `escalate-to-human` | Human-in-the-loop via Slack thread polling |
| `learn-route.ts` | `learn-route` | Learns new API routes via Slack HITL |

### Types (`src/core/types.ts`)
Key interfaces: `PipelinePayload`, `PipelineResult`, `SubTask`, `AgentResult`, `HumanEscalation`, `EscalationPayload`, `EscalationResult`, `NotificationRequest`, `LearnedRoute` (in schema file)

### Plans & Docs (`docs/`)
| File | Content |
|------|---------|
| `implementation-plan.md` | Original architecture plan |
| `plan-slack-human-in-the-loop.md` | Escalation design |
| `plan-smart-fallback-router.md` | Smart fallback router design |
| `phase-1-foundation.md` through `phase-7-*.md` | Phase-by-phase implementation notes |

---

## Post-Handover Progress (2026-03-10, Codex)

### Documentation Updates
- Added a new **Self-Improving Skills** section to `demo/README.md`.
- Documented `skills/universal-agent-skill-creator.md` as the reusable skill-generation mechanism for future agent/sub-agent capability growth.
- Clarified developer expectations:
  - new generated skills should be stored under `skills/learned/`
  - adopted skills should also be reflected in this handover file.

### Grounding Spec Migration (Plan 37) — Completed
- Grounding runtime prompt source moved to knowledge docs:
  - `knowledge/agents/grounding/system-prompt.md`
  - `knowledge/agents/grounding/decision-logic.md`
- Added reusable prompt-loader utility:
  - `src/tools/agent-spec-loader.ts`
  - behavior: markdown load + `{{KEY}}` interpolation + safe fallback
- Refactored `GroundingAgent` to load its system prompt from `knowledge/` at runtime while preserving output contract/tool usage.
- Added tests:
  - `tests/unit/agent-spec-loader.test.ts`
  - `tests/unit/grounding-agent.test.ts`
- Added fixtures:
  - `tests/fixtures/agent-spec-template.md`
  - `tests/fixtures/grounding-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now documents the `knowledge/agents/...` spec pattern.

### Cognition Spec Migration (Plan 38) — Completed
- Cognition runtime prompt source moved to knowledge docs:
  - `knowledge/agents/cognition/system-prompt.md`
  - `knowledge/agents/cognition/decision-logic.md`
- Refactored `CognitionAgent` to load its system prompt from `knowledge/` with placeholder variable interpolation:
  - dynamic brand/guardrail context
  - dynamic learned-route section injection
- Enhanced `loadAgentPromptSpec()` fallback behavior:
  - fallback prompt text now also supports `{{KEY}}` interpolation when knowledge files are missing/empty.
- Added tests:
  - `tests/unit/cognition-agent.test.ts`
  - expanded `tests/unit/agent-spec-loader.test.ts` with fallback interpolation coverage
- Added fixture:
  - `tests/fixtures/cognition-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now includes cognition in `knowledge/agents/...` runtime spec pattern.

### Agency Spec Migration (Plan 39) — Completed
- Agency runtime prompt source moved to knowledge docs:
  - `knowledge/agents/agency/system-prompt.md`
  - `knowledge/agents/agency/decision-logic.md`
- Refactored `AgencyAgent` to load its system prompt from `knowledge/` with placeholder variable interpolation:
  - dynamic brand context
  - dynamic guardrail context
- Added tests:
  - `tests/unit/agency-agent.test.ts`
- Added fixture:
  - `tests/fixtures/agency-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now includes agency in the `knowledge/agents/...` runtime spec pattern.

### Interface Spec Migration (Plan 40) — Completed
- Interface runtime prompt source moved to knowledge docs:
  - `knowledge/agents/interface/system-prompt.md`
  - `knowledge/agents/interface/decision-logic.md`
- Refactored `InterfaceAgent` to load its system prompt from `knowledge/` with placeholder variable interpolation:
  - dynamic brand name/tone/style/never-say context
  - dynamic brand voice rules
- Added tests:
  - `tests/unit/interface-agent.test.ts`
- Added fixture:
  - `tests/fixtures/interface-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now includes interface in the `knowledge/agents/...` runtime spec pattern.

### Soul File Migration (Plan 41) — Completed
- Moved brand identity source file from repo root to:
  - `knowledge/soul.md`
- Updated runtime loaders to use `knowledge/soul.md` as the primary source:
  - `src/core/context.ts`
  - `src/tools/knowledge-tools.ts`
- Kept backward-compatible legacy fallback to root `soul.md` if present.
- Updated tests/docs references:
  - `tests/unit/context.test.ts`
  - `docs/usage-guide.md`
  - `docs/sequence-diagram-swimlanes.md`
  - this handover file.

### Sub-Agent Spec Migration (Plan 42) — Completed (Phase 1)
- Migrated first sub-agent (`cohort-monitor`) prompt/docs into knowledge runtime specs:
  - `knowledge/sub-agents/cohort-monitor/system-prompt.md`
  - `knowledge/sub-agents/cohort-monitor/decision-logic.md`
- Refactored sub-agent prompt loading:
  - `src/trigger/sub-agents/plugins/cohort-monitor.ts` now loads prompt via `loadAgentPromptSpec()` with placeholder interpolation and fallback.
- Kept runtime-authoritative behavior unchanged:
  - `cohort-monitor` still executes deterministic mock-first logic in `execute()`.
- Added tests and fixture:
  - `tests/unit/cohort-monitor-sub-agent.test.ts`
  - `tests/fixtures/cohort-monitor-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now documents `knowledge/sub-agents/...` pattern.

### Sub-Agent Spec Migration (Plan 43) — Completed (Phase 2)
- Migrated `api-fetcher` sub-agent prompt/docs into knowledge runtime specs:
  - `knowledge/sub-agents/api-fetcher/system-prompt.md`
  - `knowledge/sub-agents/api-fetcher/decision-logic.md`
- Refactored sub-agent prompt loading:
  - `src/trigger/sub-agents/plugins/api-fetcher.ts` now loads prompt via `loadAgentPromptSpec()` with placeholder interpolation and fallback.
- Kept runtime-authoritative behavior unchanged:
  - `api-fetcher` still executes deterministic learned-route HTTP fetch logic in `execute()`.
- Added tests and fixture:
  - `tests/unit/api-fetcher-sub-agent.test.ts`
  - `tests/fixtures/api-fetcher-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now includes `api-fetcher` in `knowledge/sub-agents/...` references.

### Sub-Agent Spec Migration (Plan 44) — Completed (Phase 3)
- Migrated `mcp-fetcher` sub-agent prompt/docs into knowledge runtime specs:
  - `knowledge/sub-agents/mcp-fetcher/system-prompt.md`
  - `knowledge/sub-agents/mcp-fetcher/decision-logic.md`
- Refactored sub-agent prompt loading:
  - `src/trigger/sub-agents/plugins/mcp-fetcher.ts` now loads prompt via `loadAgentPromptSpec()` with placeholder interpolation and fallback.
- Kept runtime-authoritative behavior unchanged:
  - `mcp-fetcher` still executes deterministic MCP tool-calling logic, learned-route hydration, and output shaping in `execute()`.
- Added tests and fixture:
  - `tests/unit/mcp-fetcher-sub-agent.test.ts`
  - `tests/fixtures/mcp-fetcher-system-prompt-custom.md`
- Updated docs:
  - `docs/usage-guide.md` now includes `mcp-fetcher` in `knowledge/sub-agents/...` references.

### Next Planned Migration
- Current migration batch complete for existing registered sub-agents (`cohort-monitor`, `api-fetcher`, `mcp-fetcher`).

### Runtime Bugfix (Plan 46) — Completed
- Fixed knowledge prompt path resolution in Trigger runtime:
  - `src/tools/agent-spec-loader.ts` now discovers project root by walking upward for `package.json` + `knowledge`.
  - Resolution order:
    1. from `process.cwd()` (runtime cwd)
    2. from loader module directory
    3. final fallback to relative `../..`
- This resolves warnings such as:
  - `Agent prompt file missing, using fallback`
  - path incorrectly pointing to `.trigger/knowledge/...`
- Added regression coverage:
  - `tests/unit/agent-spec-loader.test.ts` now includes a `.trigger`-style external cwd scenario and verifies that `knowledge/agents/grounding/system-prompt.md` still loads.
- Validation:
  - Full unit suite passed after patch (`24` test files, `114` tests).

### Runtime Bugfix (Plan 46, Reused Number) — Completed
- Fixed grounding-stage JSON parsing robustness in Trigger pipeline:
  - `src/trigger/ground.ts` now uses shared tolerant parser (`parseAgentJson`) instead of strict `JSON.parse`.
  - Supports plain JSON, fenced JSON, and embedded JSON patterns in grounding agent output.
  - Existing fallback remains unchanged: if output is truly non-JSON, grounding safely falls back to deterministic file-parsed context and logs warning.
- Added helper for testability:
  - `buildGroundingResultFromOutput(output, context)` in `src/trigger/ground.ts`.
- Added tests:
  - `tests/unit/ground-output-parser.test.ts`
  - cases: plain JSON, fenced JSON, non-JSON fallback.
- Validation:
  - Full unit suite passed (`25` test files, `117` tests).

### Demo UI Fidelity + Raw JSON Inspector (Plan 47) — Completed
- Fixed markdown rendering edge case in demo where table rows emitted as bullet-prefixed lines (e.g. `- | Metric | Value |`) looked truncated/malformed in "Detailed Findings":
  - `demo/app.js` now normalizes bullet-prefixed table rows before markdown rendering.
- Added expandable raw JSON visibility in demo assistant messages:
  - new collapsible `Raw JSON` section showing full pipeline output payload.
  - if `formattedResponse` is itself JSON/fenced JSON, demo now shows an additional parsed collapsible block.
- Added demo styling for JSON inspector panels:
  - `demo/styles.css`.
- Validation:
  - `node --check demo/app.js`
  - full unit suite passed (`25` test files, `117` tests).

### Routing Bugfix — MCP Builder Loop Prevention (Plan 48) — Completed
- Fixed long-running/loop-prone route-learning behavior for MCP builder prompts (e.g. "Create an MCP server for our internal CRM API..."):
  - `src/trigger/execute.ts` now prioritizes deterministic special workflows before learned-route lookup:
    - `isUniversalSkillCreationIntent()` branch first
    - `isMcpBuilderIntent()` branch second
  - This prevents MCP/skill-creation requests from being hijacked by learned routes or Slack route-learning fallback loops.
- Refined route-learning heuristic:
  - `src/trigger/execute-routing.ts` now blocks `learn-new-route` for build/integration implementation intents.
  - Route-learning remains enabled for true data-fetch unknown tasks.
- Expanded MCP builder intent coverage:
  - `src/trigger/mcp-builder.ts` adds CRM/customer-lifecycle keyword variants.
- Added tests:
  - `tests/unit/execute-routing.test.ts` (build/integration prompt must not attempt route-learning)
  - `tests/unit/mcp-builder.test.ts` (exact CRM lifecycle MCP prompt detection)
- Validation:
  - focused tests passed
  - full unit suite passed (`25` test files, `119` tests).

### Learned Routes Maintenance — ID Renumbering (Plan 49) — Completed
- Normalized route numbering in `knowledge/learned-routes.json` after manual cleanup:
  - old sparse IDs (`route-001`, `route-007`...`route-012`) were renumbered to contiguous IDs (`route-001`...`route-007`) based on current route order.
- Updated embedded internal references:
  - `agentInputDefaults.routeId` values were rewritten to match the new route IDs.
- Refreshed `lastUpdated` timestamp in learned-routes file.
- Validation:
  - schema parse check passed (`LearnedRoutesFileSchema`)
  - `tests/unit/learned-routes-store.test.ts` passed.

### Provider Priority Update — OpenAI First (Plan 50) — Completed
- Updated agent model priority order to:
  1. OpenAI
  2. Anthropic (Claude)
  3. Google (Gemini)
- Applied in tracked environment configs:
  - `.env`
  - `.env.example`
- Updated code defaults (used when env vars are absent):
  - `src/config/models.ts`
  - Includes unknown-agent fallback ordering in `getModelAssignment()`.
- Updated notification manager fallback chain to include Google as third fallback.
- Validation:
  - `tests/unit/model-router.test.ts` passed
  - `tests/unit/context.test.ts` passed.

### Orchestrator Model Upgrade — OpenAI Powerful Tier (Plan 51) — Completed
- Added OpenAI powerful alias support:
  - `src/config/providers.ts` now supports `openai:powerful` mapped by `MODEL_OPENAI_POWERFUL`.
- Updated environment model aliases:
  - `.env`: added `MODEL_OPENAI_POWERFUL` (set to `gpt-5`)
  - `.env.example`: added `MODEL_OPENAI_POWERFUL=gpt-5`
- Updated orchestrator preference:
  - `.env`: `AGENT_ORCHESTRATOR_MODELS=openai:powerful,anthropic:powerful,google:balanced`
  - `.env.example`: same order
  - `src/config/models.ts` default orchestrator preferred model changed to `openai:powerful`
- Validation:
  - `tests/unit/model-router.test.ts` passed
  - `tests/unit/context.test.ts` passed
  - runtime check confirmed `getModelAssignment('orchestrator')` resolves:
    - preferred: `openai:powerful`
    - fallbacks: `anthropic:powerful`, `google:balanced`.

### Model Alias Refresh — OpenAI/Google Tiers (Plan 52) — Completed
- Updated OpenAI alias versions for faster/balanced/reasoning/powerful tiers:
  - `MODEL_OPENAI_FAST=gpt-5-mini`
  - `MODEL_OPENAI_BALANCED=gpt-5`
  - `MODEL_OPENAI_REASONING=gpt-5.2`
  - `MODEL_OPENAI_POWERFUL=gpt-5.2`
- Updated Google fast alias:
  - `MODEL_GOOGLE_FAST=gemini-2.5-flash-lite`
  - `MODEL_GOOGLE_BALANCED` remains `gemini-2.5-pro`
- Applied to:
  - `.env`
  - `.env.example`
- Updated fallback defaults (for env-missing scenarios):
  - `src/config/providers.ts`
- Validation:
  - `tests/unit/model-router.test.ts` passed
  - `tests/unit/context.test.ts` passed
  - full unit suite passed (`25` test files, `119` tests).

### OpenAI Temperature Warning Fix (Plan 53) — Completed
- Fixed AI SDK warnings for unsupported `temperature` on OpenAI reasoning model families (e.g. GPT-5/o-series):
  - warning example: `temperature is not supported for reasoning models`
- Added shared capability detection in provider layer:
  - `src/providers/model-router.ts`
  - new exports:
    - `resolveModelId(modelId)`
    - `modelSupportsTemperature(modelId)`
- Updated generation calls to set `temperature` only when supported:
  - `src/agents/base-agent.ts`
  - `src/trigger/sub-agents/base-sub-agent.ts`
- Added unit tests:
  - `tests/unit/model-capabilities.test.ts`
  - covers GPT-5/o-series unsupported paths and supported model families.
- Validation:
  - full unit suite passed (`26` test files, `123` tests).

### Learn-Route Loop Fix + Materialized Skill Reuse (Plan 61) — Completed
- Fixed the regression where `general` synthesis subtasks (e.g., "Consolidate the five KPI pulls...") were treated as route-learning candidates and entered long `learn-route` polling cycles.
- Routing heuristic hardening:
  - `src/trigger/execute-routing.ts`
  - Added synthesis/consolidation intent detection for `general` tasks.
  - `shouldAttemptRouteLearning()` now returns `false` for synthesis/consolidation tasks, while preserving route-learning for genuine unknown data-fetch tasks.
- Deterministic materialized-skill reuse in cognition:
  - `src/trigger/think.ts`
  - When a prompt matches a materialized skill candidate, cognition now annotates relevant `general` synthesis subtasks with:
    - `candidateId`
    - `suggestedSkillFile`
    - `useMaterializedSkill: true`
  - This allows execution to reuse learned skills directly instead of route-learning.
- Execution fallback improvement:
  - `src/trigger/execute.ts`
  - Unknown-agent execution now checks `useMaterializedSkill: true` first.
  - If the skill file exists under `skills/learned`, execution performs direct LLM fallback with embedded skill guidance and skips route-learning.
- Human-readable cognition specs updated:
  - `knowledge/agents/cognition/system-prompt.md`
  - `knowledge/agents/cognition/decision-logic.md`
  - Added explicit guidance for materialized skill reuse and anti-loop behavior for synthesis tasks.
- Added regression coverage:
  - `tests/unit/execute-routing.test.ts`
    - new case: synthesis/consolidation task must not trigger route-learning.
  - `tests/unit/autonomous-skill-loop.test.ts`
    - new case: materialized skill match annotates synthesis subtask with `useMaterializedSkill` metadata and avoids inserting `skill-creator`.
- Validation:
  - `npm test -- tests/unit/execute-routing.test.ts tests/unit/autonomous-skill-loop.test.ts` passed.
  - `npm test -- tests/unit/cognition-skill-candidates.test.ts` passed.
  - `npm run build` currently fails due pre-existing generic type-constraint issues in:
    - `src/trigger/deliver.ts`
    - `src/trigger/execute.ts`
    - `src/trigger/think.ts`

### Trigger CLI Version Mismatch Fix (Plan 62) — Completed
- Issue:
  - `npm run trigger:dev` failed with `Invalid Version: ^4.4.1` because scripts were pinned to Trigger CLI v3 while project uses `@trigger.dev/sdk ^4.4.1`.
- Fix:
  - Updated npm scripts in `package.json`:
    - `trigger:login`: `npx trigger.dev@4.4.3 login --api-url http://localhost:3040`
    - `trigger:dev`: `npx trigger.dev@4.4.3 dev --api-url http://localhost:3040`
- Validation:
  - `npx trigger.dev@4.4.3 --version` => `4.4.3`
  - `npm run trigger:dev -- --help` executed successfully (no version parsing error).

### Trigger Local Queue Unblock + Webapp Crash Recovery (Plan 64) — Completed
- Symptoms:
  - Trigger runs stayed `QUEUED` and never started.
  - `trigger-dev-local-webapp-1` was in a restart loop.
  - Original run `run_n19ds8af2pkvk8d9q7vsm` remained `CANCELED` (attemptCount `0`).
- Root cause:
  - ClickHouse URL query parameters in local self-hosted stack were incompatible with webapp runtime client (`@clickhouse/client`), while ClickHouse migrations still required `secure=false` to avoid forced TLS parsing.
- Recovery applied in local Trigger stack (`../trigger-dev-local/.env`, outside this repo):
  - `CLICKHOUSE_URL=http://trigger:trigger@clickhouse:8123/default?secure=false`
  - `QUERY_CLICKHOUSE_URL=http://trigger:trigger@clickhouse:8123/default`
  - `LOGS_CLICKHOUSE_URL=http://trigger:trigger@clickhouse:8123/default`
  - `EVENTS_CLICKHOUSE_URL=http://trigger:trigger@clickhouse:8123/default`
- Recovery steps executed:
  - Restarted webapp via compose with env file reload.
  - Re-ran `npm run trigger:dev`.
  - Triggered exact prompt in terminal:
    - `"How is our VIP cohort performing this quarter?"`
- Validation:
  - New run `run_cmml5x25600013anvd66xq3tr` completed successfully.
  - Pipeline stages `ground`, `think`, `execute`, and `deliver` executed.
  - Queue processing resumed (no permanent `QUEUED` state).

### Env Sync: Learned Routes DB Vars Added to `.env` (Plan 65) — Completed
- Added missing learned-routes storage vars from `.env.example` into `.env`:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres`
  - `LEARNED_ROUTES_DUAL_WRITE_JSON=false`
- Purpose:
  - Ensure runtime can use DB-backed learned routes when expected instead of silently operating JSON-only due missing env vars.

### Learned Routes Restoration (Plan 66) — Completed
- Restored `knowledge/learned-routes.json` from commit `949833b` (latest full valid set before placeholder overwrite).
- Restored route set includes 10 routes:
  - `route-001`..`route-010`
  - MCP routes for Mapp prompts (including page impressions, segments, dimensions/metrics)
  - API workflow routes from Plan 56
- Backfilled restored JSON into DB-backed store:
  - Ran: `npm run routes:backfill`
  - Result: `imported: 10, skipped: 0`
  - Verified `learned_routes` table now contains 10 rows.

### Cognition DB-Load Crash Fix (Plan 67) — Completed
- Incident investigated:
  - Run `run_cmmlrquwk000g38nnq212y57m` failed at `pipeline-think`.
  - Error: `learnedRoutesStore.load() must be awaited before using DB-backed routes`.
- Root cause:
  - `orchestrate-pipeline` and `pipeline-think` execute in separate task processes.
  - `orchestrate` was awaiting `learnedRoutesStore.load()`, but `pipeline-think` process was not.
  - Cognition prompt builder reads learned route summary synchronously, which throws in DB mode when store is not preloaded.
- Fix implemented:
  - `src/trigger/think.ts`
    - Added `preloadCognitionStores()` helper.
    - `pipeline-think` now awaits:
      - `learnedRoutesStore.load()`
      - `skillCandidatesStore.load()`
    - before calling `cognitionAgent.execute(...)`.
- Regression coverage:
  - `tests/unit/autonomous-skill-loop.test.ts`
    - Added test to assert preload order: routes store first, then skill candidates store.
- Validation:
  - `npm test -- tests/unit/autonomous-skill-loop.test.ts` passed.
  - Live run with prompt `"Show me my page impressions for the last 7 days"`:
    - `run_cmmlrvx8n000w38nnn7p7dzew`
    - `pipeline-think` completed successfully (no DB-load crash).

### Execute DB-Load Crash Fix (Plan 68) — Completed
- Incident investigated:
  - User reported run `run_cmmlrzhex001f38nn93txx7n8` with execute-stage error:
    `learnedRoutesStore.load() must be awaited before using DB-backed routes`.
- Clarification:
  - The top-level run finished `COMPLETED`, but execute-stage logged a subtask exception.
  - `pipeline-execute` uses `Promise.allSettled`, so a thrown subtask error can be logged while the stage still completes with degraded output.
- Root cause:
  - Same process-bound preload issue as cognition:
    - `orchestrate` preloaded routes in its process
    - `pipeline-execute` may run in a separate process and accessed `learnedRoutesStore.getById/findByCapability` before `load()`.
- Fix implemented:
  - `src/trigger/execute.ts`
    - Added `preloadExecutionStores()` helper.
    - `pipeline-execute` now awaits:
      - `learnedRoutesStore.load()`
      - `skillCandidatesStore.load()`
    - before route access in subtask execution.
  - `src/trigger/learn-route.ts`
    - Added `await learnedRoutesStore.load()` at task start for DB-mode safety in route-learning flow.
- Regression coverage:
  - `tests/unit/autonomous-skill-loop.test.ts`
    - Added test asserting execute preload order (`routes` then `skills`).
- Validation:
  - `npm test -- tests/unit/autonomous-skill-loop.test.ts` passed.
  - Live verification run:
    - `run_cmmls5cgh001w38nnyrql3ujk`
    - `pipeline-ground`, `pipeline-think`, `pipeline-execute`, `pipeline-deliver` all `COMPLETED`
    - no DB-load exception observed.

### Autonomous Skill Spam / Non-Reuse Fix (Plan 69) — Completed
- Incident investigated:
  - Repeating prompt `"How many API calculations have I used this month?"` generated many new files under `skills/learned/` instead of reusing existing ones.
  - `knowledge/skill-candidates.json` accumulated many low/zero-usage candidates.
- Root cause:
  - Agency `skillSuggestions` were persisted/materialized in execute phase without relevance gating against current cognition context.
  - Candidate dedupe was strict (exact capability/path only), so semantically similar suggestions could create new candidates/files.
- Fix implemented:
  - `src/trigger/execute.ts`
    - Added `filterSkillSuggestionsForCognitionContext(...)` scoring filter.
    - Only context-relevant suggestions are persisted/materialized.
    - Dropped low-relevance suggestions are logged and surfaced as issues.
  - `src/routing/skill-candidates-store.ts`
    - Added fuzzy dedupe using:
      - capability/description token overlap
      - skill-file stem overlap
      - trigger-pattern similarity
    - Similar suggestions now merge into existing candidate instead of creating new entries.
- Regression coverage:
  - `tests/unit/autonomous-skill-loop.test.ts`
    - Added test for dropping low-relevance skill suggestions.
  - `tests/unit/skill-candidates-store.test.ts`
    - Added fuzzy dedupe test for semantically similar candidates.
- Validation:
  - `npm test -- tests/unit/autonomous-skill-loop.test.ts tests/unit/skill-candidates-store.test.ts` passed (`13` tests).

### Learned Skills Reset (Plan 70) — Completed
- User-requested cleanup executed:
  - Removed all materialized learned skills from `skills/learned/`.
  - Reset `knowledge/skill-candidates.json` to an empty `candidates` array.
- Rationale:
  - Clear previously accumulated autonomous skills/candidates and restart learning from a clean baseline.
- Notes:
  - Core static skills remain untouched under `skills/` (outside `skills/learned`).

### Repeated Prompt Learned-Skill Spam Guard (Plan 71) — Completed
- Incident investigated:
  - Repeating exact prompt `"How many API calculations have I used this month?"` generated new learned skills each run (`mapp-usage-schema-normalizer`, `mcp-usage-normalizer`) instead of only reusing the existing monthly usage skill.
- Root cause:
  - Agency kept emitting additional implementation-level `skillSuggestions` (normalizer variants) after successful runs.
  - Existing relevance filter allowed them because they were still semantically close to the same monthly-usage context.
  - No hard lock existed to restrict persistence when a materialized best-match skill already existed.
- Fix implemented:
  - `src/trigger/execute.ts`
    - Added prompt-anchor derivation from cognition output.
    - If a materialized matching candidate exists, autonomous persistence is locked to that exact capability/skill file.
    - Added anti-spam cap: persist at most one autonomous skill suggestion per run.
    - Updated issue text to indicate relevance/anti-spam drops.
- Regression coverage:
  - `tests/unit/autonomous-skill-loop.test.ts`
    - Added lock-to-existing-skill test.
    - Added one-suggestion-cap test.
- Validation:
  - `npm test -- tests/unit/autonomous-skill-loop.test.ts tests/unit/skill-candidates-store.test.ts` passed (`15` tests).

### Learned Skills + Candidates Cleanup (Plan 72) — Completed
- User-requested cleanup executed again:
  - Removed all files under `skills/learned/`.
  - Reset `knowledge/skill-candidates.json` to an empty `candidates` array.
- Verification:
  - Learned skill files count: `0`
  - Skill candidates count: `0`

### Async Skill-Learner Decoupling (Plan 73) — Completed
- Objective:
  - Reduce marketer-facing latency by removing autonomous skill materialization from the blocking `pipeline-execute` critical path.
- Implementation:
  - Added shared helper module:
    - `src/trigger/skill-learning.ts`
    - Contains relevance scoring/filtering, anti-spam preparation, and materialization persistence utilities.
  - Added new background task:
    - `src/trigger/skill-learner.ts` (`id: pipeline-skill-learner`)
    - Applies anti-spam policy (`max 1` suggestion/run + lock to matched materialized candidate) and persists/materializes asynchronously.
  - Refactored `src/trigger/execute.ts`:
    - Keeps parse-only handling of `skillSuggestions`.
    - No longer persists/materializes suggestions inline.
  - Updated `src/trigger/orchestrate.ts`:
    - Queues `pipeline-skill-learner` in fire-and-forget mode immediately after Agency stage.
    - Continues directly to Interface stage without waiting for autonomous learning.
  - Updated docs:
    - `docs/usage-guide.md` now documents asynchronous post-execution skill-learning behavior.
- Tests added/updated:
  - `tests/unit/skill-learning.test.ts` (new): anti-spam lock + cap behavior.
  - `tests/unit/orchestrate-skill-learner.test.ts` (new): background queue helper behavior.
  - `tests/unit/autonomous-skill-loop.test.ts` updated to import skill-learning helpers from new module.
- Validation:
  - `npm test -- tests/unit/autonomous-skill-loop.test.ts tests/unit/skill-candidates-store.test.ts tests/unit/skill-learning.test.ts tests/unit/orchestrate-skill-learner.test.ts`
  - Result: `18` tests passed.

#### Plan 73 Timing Benchmark (Exact Prompt)
- Prompt used:
  - `"How many API calculations have I used this month?"`
- Post-change benchmark runs (version `20260311.13`):
  - `run_cmmlyxqst003r3annzi9c3153`:
    - ground: `6386ms`
    - think: `5313ms`
    - execute: `61250ms`
    - deliver: `31292ms`
    - skill-learner (async): `53ms`
  - `run_cmmlz23fz00433ann4jd0c6xe`:
    - ground: `6888ms`
    - think: `6056ms`
    - execute: `35365ms`
    - deliver: `29915ms`
    - skill-learner (async): `22ms`
- Pre-change comparison cohort (same prompt, version `20260311.6`, 4 runs):
  - Average ground: `3390ms`
  - Average think: `6669ms`
  - Average execute: `143495ms`
  - Average deliver: `29901ms`
  - Average core path (ground+think+execute+deliver): `183455ms`
- Post-change average (version `20260311.13`, 2 runs):
  - Average ground: `6637ms`
  - Average think: `5685ms`
  - Average execute: `48308ms`
  - Average deliver: `30604ms`
  - Average core path: `91234ms`
  - Average skill-learner (async): `38ms`
- Delta (pre `20260311.6` avg -> post `20260311.13` avg):
  - `pipeline-execute`: `-95187ms` (~`66%` faster)
  - Core path overall: `-92221ms` (~`50%` faster)

### Execute/Deliver Latency Deep Profile (Plan 74) — Completed
- Scope:
  - Deep profile of remaining latency after Plan 73 for prompt:
    - `"How many API calculations have I used this month?"`
- Data points inspected:
  - `run_cmmlyxqst003r3annzi9c3153` (post-change)
    - `pipeline-execute`: `61250ms`
    - execute subtask breakdown:
      - `task-1` (`mcp-fetcher`): `1965ms`
      - `task-2` (`general`): `22643ms`
    - inferred execute overhead beyond subtasks: ~`36642ms` (Agency summary/model + stage overhead)
    - `pipeline-deliver`: `31292ms`
  - `run_cmmlz23fz00433ann4jd0c6xe` (post-change)
    - `pipeline-execute`: `35365ms`
    - execute subtask breakdown:
      - `task-1` (`mcp-fetcher`): `1668ms`
      - `task-2` (`general` using materialized skill guidance): `5ms`
    - inferred execute overhead beyond subtasks: ~`33692ms` (Agency summary/model + stage overhead)
    - `pipeline-deliver`: `29915ms`
- Findings:
  - Remaining bottleneck is no longer autonomous skill persistence.
  - Primary latency now comes from LLM-heavy summarization/formatting:
    - Agency stage post-subtask summary call (~`33–37s`).
    - Interface stage formatting call (~`30–31s`).
  - Secondary variability source:
    - Cognition sometimes emits `task-2` as a real `general` LLM summary subtask (~`22.6s`), which further inflates execute time.
- Recommended next optimization targets:
  1. Add deterministic fast-path in execute for single-route deterministic fetch responses (skip Agency summary model when safe).
  2. Tighten cognition policy to avoid creating `general` synthesis subtask for this prompt class when materialized route/skill already exists.
  3. Move Interface formatting to a faster model tier for routine structured summaries.

### Deterministic Execute Summary Fast Path (Plan 75) — Completed
- Implemented:
  - Added `buildDeterministicAgencyFastPathSummary(...)` in `src/trigger/execute.ts`.
  - `pipeline-execute` now skips Agency summary model call when:
    - exactly one deterministic route subtask succeeded (`mcp-fetcher`/`api-fetcher`/`cohort-monitor`),
    - optional non-deterministic subtasks are synthesis-only,
    - no failed subtasks.
  - In fast-path mode, `agencyResult.summary` is generated deterministically.
- Tests:
  - Added `tests/unit/execute-fast-path.test.ts` covering:
    - eligible case (deterministic route + synthesis),
    - ineligible multiple deterministic routes,
    - ineligible non-synthesis `general` subtask.
  - Validation command:
    - `npm test -- tests/unit/execute-fast-path.test.ts tests/unit/autonomous-skill-loop.test.ts tests/unit/skill-learning.test.ts tests/unit/orchestrate-skill-learner.test.ts`
    - Result: `15` tests passed.
- Benchmark (exact prompt):
  - Prompt: `"How many API calculations have I used this month?"`
  - Run: `run_cmmm07ara00573annlempsi2z` (version `20260311.17`)
    - ground: `3264ms`
    - think: `4895ms`
    - execute: `41368ms`
    - deliver: `30543ms`
    - skill-learner: `null` (no persisted suggestion in this run)
  - Confirmed fast-path activation from execute summary text.
- Remaining bottleneck:
  - In this run, a cognition-generated `general` synthesis subtask consumed `38051ms`.
  - Fast-path removed Agency summary-model overhead, but total execute latency is still dominated by that synthesis subtask.

### Multi-Brand Demo Dropdown + Repo-Backed Brand Overrides (Plan 99) — Completed
- Objective:
  - Add a second seeded demo brand, make the demo brand-aware with a dropdown, and introduce repo-backed brand-specific prompt overrides with shared global guardrails.
- Implementation:
  - Added second seeded brand:
    - `northline-fashion`
  - Added repo-backed brand knowledge:
    - `knowledge/brands/northline-fashion/soul.md`
    - `knowledge/brands/northline-fashion/guardrails.md`
    - `knowledge/brands/northline-fashion/agents/grounding/system-prompt.md`
  - Refactored brand seeding:
    - startup now inserts missing seeded brands by `id`
    - existing DB brands are left untouched
    - fallback mode exposes both seeded brands
  - Added merged guardrail behavior:
    - global `knowledge/guardrails.md` remains active for every brand
    - brand-specific guardrails append and de-duplicate
  - Refactored prompt loading:
    - prompt-backed main agents and prompt-backed sub-agents now resolve:
      1. brand-specific repo override
      2. generic repo prompt
      3. hardcoded fallback
    - added lightweight in-memory prompt file caching
  - Grounding now has a full brand-specific override for `northline-fashion`
  - Skill matching is now explicitly brand-preferred:
    - matching brand-scoped skills win before global skills for the same prompt
  - Added public marketer-safe endpoint:
    - `GET /brands`
  - Updated demo:
    - brand selector is now a dropdown
    - options load from `GET /brands`
    - fallback list is used when the endpoint fails
    - switching brands resets the local session and clears chat history
- Automated validation:
  - `npm run build`
  - `npm test -- tests/unit/agent-spec-loader.test.ts tests/unit/grounding-agent.test.ts tests/unit/brand-store.test.ts tests/unit/skill-candidates-store.test.ts tests/unit/public-routes.test.ts`
  - `npm test -- tests/unit/cognition-agent.test.ts tests/unit/agency-agent.test.ts tests/unit/interface-agent.test.ts tests/unit/api-fetcher-sub-agent.test.ts tests/unit/mcp-fetcher-sub-agent.test.ts tests/unit/cohort-monitor-sub-agent.test.ts`
- Manual verification:
  - Live API smoke check for `GET /brands`
  - Demo smoke check for dropdown rendering and brand switch reset
- Not tested:
  - Full end-to-end marketer prompt run through `northline-fashion` on a live Trigger worker was not executed in this change set
- How to test:
  1. Start the API server, demo, and Trigger worker.
  2. Run `curl http://localhost:3001/brands`.
     - Expect `acme-marketing` and `northline-fashion`.
  3. Open `http://localhost:4173`.
     - Expect the top-right brand selector to be a dropdown.
  4. Switch to `Northline Fashion`.
     - Expect the session to reset and the chat log to clear.
  5. Send:
     - `Create a campaign concept for a softly tailored, below-knee knit dress in a neutral palette.`
     - Expect output to stay within the fashion envelope.
  6. Send:
     - `Create a neon cut-out sheer partywear concept for our spring drop.`
     - Expect refusal, redirect, or constrained reframing.
- Important follow-up:
  - If future brands need stronger behavior differences, add prompt overrides under:
    - `knowledge/brands/<brandId>/agents/...`
    - `knowledge/brands/<brandId>/sub-agents/...`
  - Keep brand prompts/guardrails repo-backed unless there is a deliberate later decision to introduce DB overrides.

---

## Plan 100 — Knowledge Editor in Admin UI (Claude, 2026-04-01)

**Deliverable:** Admins can browse and edit all `.md` files in `knowledge/` directly from the Admin UI — no SSH or IDE access needed.

**What was built:**
- `src/admin/knowledge-fs.ts` — safe file-access layer (path traversal protection, `.md`-only, 512 KB cap, no file creation)
- Three new routes on the existing admin router: `GET /admin/knowledge/files`, `GET /admin/knowledge/file`, `PUT /admin/knowledge/file`
- Knowledge Editor page in Admin UI: file tree sidebar + textarea editor with dirty-tracking and Save button

**Automated validation:** None (no unit tests exist for admin routes).

**Manual verification:** Not yet run — requires the admin server and main API to be running.

**Not tested:** Live agent picking up an edited file after save (needs a full pipeline trigger).

**How to test:** See [plan-100-claude.md](ai-coding-plans/plan-100-claude.md).

---

## Plan 101 — VS Code-style collapsible tree for Knowledge Editor (Claude, 2026-04-01)

**Deliverable:** Knowledge Editor file panel now renders a recursive, collapsible/expandable folder tree (VS Code Explorer style) instead of a flat grouped list.

**What was built:**
- `buildKnowledgeTree()` — converts flat `KnowledgeFile[]` into a nested tree
- `renderTreeNode()` — recursive HTML renderer with depth-based indentation, chevron icons, folder/file icons, and collapse state
- `knowledgeState.collapsedFolders` — `Set` tracking which folders are collapsed (in-memory)
- Folders sort before files; both sort alphabetically within their group

**Automated validation:** None.

**Manual verification:** Not yet run.

**Not tested:** Collapse state persistence across page reloads (intentionally in-memory only).

**How to test:** See [plan-101-claude.md](ai-coding-plans/plan-101-claude.md).

---

## Plan 103 — Fix: Knowledge Editor files not loading on initial visit (Claude, 2026-04-01)

**Deliverable:** Bug fix — knowledge file tree was stuck on "Loading…" on first page visit.

**Root cause:** `loadKnowledgeFiles()` was only triggered by `hashchange`, which never fires on initial page load.

**Fix:** Added `loadKnowledgeFiles()` to `loadAll()` so it runs in `bootstrap()` on every startup.

**Automated validation:** None.

**Manual verification:** Not yet run.

**How to test:** See [plan-103-claude.md](ai-coding-plans/plan-103-claude.md).

---

## Plan 104 — Marketer Demo redesign + brand-scoped Knowledge Editor (Claude, 2026-04-01)

**Deliverable:** Demo UI matches admin UI style and adds a brand-scoped Knowledge Editor. Marketers see only their own brand's `.md` files.

**What was built:**
- `src/admin/knowledge-fs.ts`: added `listBrandFiles`, `readBrandFile`, `writeBrandFile` — restricted to `knowledge/brands/{brandId}/`, brandId validated with regex
- `src/public/routes.ts`: added `GET/PUT /brands/:brandId/knowledge/file(s)` public routes
- `demo/index.html`: full redesign — sidebar layout, admin colour palette, Chat + Knowledge Editor pages
- `demo/app.js`: sidebar navigation, brand-scoped VS Code tree, chat retained, brand switch reloads tree
- `demo/styles.css`: replaced teal/pink palette with admin purple/cream design tokens

**Security:** Cross-brand access prevented server-side — each route resolves only within `knowledge/brands/{brandId}/`. Path traversal uses same guard as admin. No file creation.

**Automated validation:** None.

**Manual verification:** Not yet run.

**How to test:** See [plan-104-claude.md](ai-coding-plans/plan-104-claude.md).

---

## Plan 106 — Demo: extract each page into its own view module (Claude, 2026-04-01)

**Deliverable:** Demo refactored into a proper module-based SPA. Each nav item is a self-contained ES module; adding a new page = one new file in `demo/views/`.

**What was built:**
- `demo/index.html` — shell only: sidebar + `<div id="view-outlet">`
- `demo/app.js` — router + shared state/utilities (brand, API base, auto-detect); each route is a dynamic `import()`
- `demo/views/chat.js` — full chat page (HTML generation, all chat/markdown/JSON logic, `mount`/`unmount`/`onBrandChange`)
- `demo/views/knowledge-editor.js` — full knowledge editor (VS Code tree, file I/O, `mount`/`unmount`/`onBrandChange`/`onApiBaseChange`)
- `demo/views/dashboard.js` — placeholder with welcome card and quick-links

**View contract:** `mount(outlet, ctx)` / `unmount()` / optional `onBrandChange()` / `onApiBaseChange()`

**Automated validation:** None.
**Manual verification:** Not yet run.
**How to test:** See [plan-106-claude.md](ai-coding-plans/plan-106-claude.md).

---

## Plan 102 — Prevent Creative `general` Task Route Hijack (Codex, 2026-04-01)

**Deliverable:** `pipeline-execute` no longer lets stale broad learned API routes override creative/copy `general` subtasks unless the task actually looks like external data retrieval.

**What was built:**
- Added creative-task detection in `src/trigger/execute-routing.ts`
- Added `shouldUseMatchedLearnedRoute()` so creative/copy subtasks fall back to the Agency LLM instead of blindly accepting any learned route match
- Wired `pipeline-execute` to pass `allowLearnedRoute` into `resolveUnknownSubtaskStrategy()`
- Added audit detail on LLM fallback when a learned route match was intentionally ignored
- Added regression tests proving:
  - creative `general` tasks do **not** use matched learned routes
  - the Mapp catalog prompt still **does** use the learned deterministic route

**Root cause investigated:**
- The reported run `run_cmng3ndwr002u3annnbpogzy8` was **not** the Mapp dimensions prompt; it was:
  - `Create a campaign concept for a softly tailored, below-knee knit dress in a neutral palette.`
- DB-backed `route-011` is a bad global API route pointing at `https://api.example.com/v1/data`
- Its generic match patterns allowed `pipeline-execute` to select it for a creative `general` subtask
- `api-fetcher` then failed with `fetch failed`

**Automated validation:**
- `npm test -- tests/unit/execute-routing.test.ts`

**Manual verification:**
- Direct DB-backed logic check with `learnedRoutesStore.load()`:
  - confirmed the bad route still exists in DB
  - confirmed the new guard rejects learned-route usage for the creative subtask description

**Not tested:**
- Full live Trigger rerun of the creative prompt after the fix in a running local worker

**How to test:**
1. Run `npm test -- tests/unit/execute-routing.test.ts`
2. Re-run:
   - `Create a campaign concept for a softly tailored, below-knee knit dress in a neutral palette.`
3. In audit/Trigger logs, confirm:
   - task-1 does **not** call `api-fetcher`
   - task-1 does **not** bind to `route-011`
   - task-1 falls back to the LLM creative path
4. Re-run:
   - `List all available dimensions and metrics in Mapp Intelligence`
5. Confirm the Mapp prompt still uses the MCP learned route and is unaffected

**Reference plan:** [plan-102-codex.md](ai-coding-plans/plan-102-codex.md)

---

## Plan 105 — Human-Readable Audit Payload Inspector in Admin UI (Codex, 2026-04-01)

**Deliverable:** Audit event payloads in the Admin UI now render as a structured inspector first, with raw JSON moved to a secondary collapsible section.

**What was built:**
- Added a structured audit payload renderer in `admin/public/app.js`
- Long and multiline strings now render as readable expandable text blocks instead of escaped JSON blobs
- Nested objects render as labeled field groups
- Arrays render as chips or expandable indexed lists depending on content shape
- Added specific handling for `text-preview` audit payload objects so prompt previews/system prompt previews read cleanly
- Kept `Raw JSON` available below the structured view for exact debugging/copying
- Added supporting styles in `admin/public/index.html`

**Automated validation:**
- `node --check admin/public/app.js`
- `npm run build`

**Manual verification:**
- Not run in a live browser inside this sandbox

**Not tested:**
- Visual browser pass on the Admin UI Audit page
- Full interaction against multiple real audit event types in a running local admin server

**How to test:**
1. Start the main API and the Admin UI.
2. Open the Audit page in the Admin UI.
3. Load a run that contains:
   - `prompt_snapshot`
   - `result`
   - `tool_call`
4. Confirm payloads now show:
   - readable labeled fields
   - expandable text blocks for prompts/system prompts
   - nested object/array inspection without a single giant JSON blob
5. Expand `Raw JSON` and confirm the exact payload is still available underneath.

**Reference plan:** [plan-105-codex.md](ai-coding-plans/plan-105-codex.md)
