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

### 4. Slack Integration (Partially Working)
- Bot token configured, `chat:write` scope works
- Messages send successfully to `#brand-cp-test` channel
- **BLOCKED:** `channels:history` scope NOT yet approved by Slack admin
  - Needed for `conversations.replies()` — reading thread replies
  - Both human-in-the-loop and smart fallback router depend on this

### 5. Human-in-the-Loop Escalation (Code Complete, Untested)
**Files:**
- `src/escalation/slack-escalation.ts` — Send Block Kit message, poll thread replies, parse approve/reject
- `src/trigger/escalate.ts` — Trigger.dev task wrapping the escalation flow

**How it works:**
1. Send rich Block Kit message to Slack with instructions
2. Poll `conversations.replies()` every 30 seconds
3. Parse "approve"/"yes"/"lgtm" → approved; "reject"/"no"/"deny" → rejected
4. Post confirmation in thread
5. Return `EscalationResult` to caller

**Status:** Code is complete but CANNOT be tested until `channels:history` scope is approved.

### 6. Smart Fallback Router (Code Complete, Untested)
**Files:**
- `src/routing/learned-routes-schema.ts` — Zod schemas
- `src/routing/learned-routes-store.ts` — Singleton store (load/save/find/add from `knowledge/learned-routes.json`)
- `src/routing/route-learning-escalation.ts` — Slack HITL for learning API endpoints
- `src/trigger/learn-route.ts` — Trigger.dev task for route learning
- `src/trigger/sub-agents/plugins/api-fetcher.ts` — Sub-agent executing learned routes
- `knowledge/learned-routes.json` — Human-readable route storage (currently empty)

**How it works:**
1. When a subtask has no matching sub-agent (falls back to "general"):
   - Check `knowledge/learned-routes.json` for a matching learned route
   - If found → dispatch to `api-fetcher` sub-agent (direct HTTP fetch)
   - If not → trigger Slack HITL asking marketer for API endpoint URL
   - Save learned route to JSON file for future use
   - If Slack times out → fall back to generic LLM response
2. Future requests: Cognition agent sees learned routes in its system prompt → assigns `api-fetcher` directly

**Status:** Code is complete but CANNOT be tested until `channels:history` scope is approved.

---

## What Needs to Be Done Next

### BLOCKED — Waiting on Slack Admin
- **Add `channels:history` Bot Token Scope** to the Slack app at api.slack.com/apps
- **Add `users:read` Bot Token Scope** (optional, for resolving user display names)
- **Reinstall the app** to the workspace after adding scopes
- Once approved, run the scope test:
  ```bash
  npx tsx -e "
  import 'dotenv/config';
  import { WebClient } from '@slack/web-api';
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const channel = process.env.SLACK_DEFAULT_CHANNEL || '#brand-cp-test';
  async function test() {
    const msg = await client.chat.postMessage({ channel, text: 'scope test' });
    const replies = await client.conversations.replies({ channel, ts: msg.ts, limit: 5 });
    console.log('conversations.replies OK:', replies.messages?.length);
  }
  test().catch(e => console.log('FAIL:', e.message));
  "
  ```

### Testing (Once Slack Scopes Are Approved)

#### Test Human-in-the-Loop Escalation
1. The `escalateTask` is defined but never called from the pipeline yet
2. You could trigger it directly for testing:
   ```typescript
   await escalateTask.trigger({
     escalation: {
       runId: "test-run",
       taskDescription: "Approve Q1 campaign launch",
       reason: "Budget exceeds $10k threshold",
       severity: "warning",
       notifyMarketer: true,
       notifyAdmin: false,
       context: {},
     },
     timeoutMinutes: 5,
   });
   ```
3. Reply "approve" or "reject" in the Slack thread
4. Verify the task picks up the reply and returns the decision

#### Test Smart Fallback Router
1. Start Trigger.dev: `npx trigger dev`
2. Start API server: `npx tsx src/index.ts`
3. Send a request that will fall back to "general":
   ```bash
   curl -X POST http://localhost:3001/message \
     -H "Content-Type: application/json" \
     -d '{"userMessage":"What are the biggest drivers of Customer Lifetime Value for us?"}'
   ```
4. Watch the Slack channel — a route learning message should appear
5. Reply with a URL: `URL: https://api.example.com/v1/clv`
6. Verify `knowledge/learned-routes.json` was updated with the new route

### Potential Improvements
- **Integrate escalation into pipeline**: Add try/catch in `orchestrate.ts` to trigger `escalateTask` when a stage fails
- **Add more sub-agent plugins**: The `plugins/index.ts` has placeholders for journey-agent, consumer-insights, segment-agent, etc.
- **Persist memory**: Short-term and long-term memory are currently in-memory only — add Redis or SQLite backing
- **Production Slack setup**: Consider Socket Mode for environments without public URLs

---

## Post-Handover Progress (2026-03-06, Codex)

### Completed (non-blocked)
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

### Still blocked
- End-to-end testing for Slack thread polling (`conversations.replies`) remains blocked until Slack app has `channels:history` scope approved and app reinstalled.

### Validation status
- `npm test`: passing
- `npx tsc --noEmit`: passing

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
