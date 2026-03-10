# Development Handover — Continue from Here

> **Last updated:** 2026-03-09
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
  - Guidance explicitly targets `./skills` as destination for new reusable skills.
- Agency routing update:
  - `src/trigger/execute.ts` now routes unknown subtasks with skill-creation intent to universal skill-creator workflow before generic fallback.
- Prompt-level behavior update across agents and sub-agents:
  - Main agents updated (`grounding`, `cognition`, `agency`, `interface`) to explicitly recommend creating reusable skills via `./skills/universal-agent-skill-creator.md` and storing new skills under `./skills`.
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
  - new generated skills should be stored under `skills/`
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
