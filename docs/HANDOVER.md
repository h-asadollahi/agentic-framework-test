# Development Handover — Continue from Here

> **Last updated:** 2026-03-06
> **Previous AI:** Claude Opus 4.6 via Claude Code
> **Next AI:** OpenAI Codex (or any agent picking this up)

---

## Project Overview

Multi-agent marketing platform built with **Trigger.dev v3** (orchestration) + **Vercel AI SDK v6** (AI layer) + **TypeScript** + **Hono** (API server).

**Repo:** `git@github.com:h-asadollahi/agentic-framework-test.git` (branch: `main`)

### Architecture

```
POST /message → Hono API (port 3001)
  → tasks.trigger("orchestrate-pipeline")
    → Stage 1: Grounding   (loads soul.md, guardrails)
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
├── tools/               # Knowledge file readers (soul.md, guardrails.md)
├── trigger/             # Trigger.dev tasks (orchestrate, ground, think, execute, deliver, notify, escalate, learn-route)
│   └── sub-agents/      # Plugin system (registry, base class, plugins/)
│       └── plugins/     # cohort-monitor, api-fetcher
└── index.ts             # Hono API server
```

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
SLACK_DEFAULT_CHANNEL=#brand-cp-test
MARKETER_SLACK_CHANNEL=#brand-cp-test
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
| `ground.ts` | `pipeline-ground` | Loads brand context from soul.md + guardrails.md |
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
