# Usage Guide — Multi-Agent Marketing Platform

A step-by-step guide to setting up, running, using, and extending the platform.

---

## Table of Contents

1. [Prerequisites & Installation](#1-prerequisites--installation)
2. [Running the System](#2-running-the-system)
3. [Sending Your First Message](#3-sending-your-first-message)
4. [API Reference](#4-api-reference)
5. [Creating a Custom Sub-Agent](#5-creating-a-custom-sub-agent)
6. [Adding a Notification Channel](#6-adding-a-notification-channel)
7. [Connecting MCP Servers](#7-connecting-mcp-servers)
8. [Human-in-the-Loop Escalation](#8-human-in-the-loop-escalation)
9. [Memory System](#9-memory-system)
10. [Out-of-Scope Requests](#10-out-of-scope-requests)
11. [Running Tests](#11-running-tests)
12. [Production Considerations](#12-production-considerations)
13. [Prompt Examples](#13-prompt-examples)
14. [Agent Specs in Knowledge](#14-agent-specs-in-knowledge)

---

## 1. Prerequisites & Installation

### Requirements

- **Node.js** 20+ (ES2022 target)
- **npm** 9+
- **Docker** and **Docker Compose** (for self-hosted Trigger.dev)
- At least one AI provider API key (Anthropic recommended)

### Setup

```bash
# Clone the repo
git clone git@github.com:h-asadollahi/agentic-framework-test.git
cd framework-agents

# Install dependencies
npm install

# Copy the environment template
cp .env.example .env
```

### Configure environment variables

Open `.env` and fill in your keys:

```bash
# Required — at least one AI provider
ANTHROPIC_API_KEY=sk-ant-...

# Required — Trigger.dev (self-hosted, see docs/trigger-dev-self-hosted.md)
TRIGGER_API_URL=http://localhost:3040
TRIGGER_SECRET_KEY=tr_dev_...  # copy from your local Trigger.dev dashboard

# Optional — additional AI providers
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...

# Optional — Slack notifications
SLACK_BOT_TOKEN=xoxb-...
SLACK_ADMIN_HITL_CHANNEL=#brand-cp-admin-hitl
SLACK_ADMIN_MONITORING_CHANNEL=#brand-cp-admin-monitoring
SLACK_MARKETERS_HITL_CHANNEL=#brand-cp-marketers-hitl
SLACK_MARKETERS_MONITORING_CHANNEL=#marketing-team-monitoring

# Optional — Email notifications (SendGrid)
SENDGRID_API_KEY=SG...
EMAIL_FROM_ADDRESS=agents@company.com
EMAIL_FROM_NAME=Marketing Agent

# Optional — Webhook notifications
WEBHOOK_SECRET=your-shared-secret

# Optional — Escalation recipients
ADMIN_EMAIL=admin@company.com

# Optional — MCP servers (JSON array)
# MCP_SERVERS=[{"name":"analytics","command":"npx","args":["-y","@analytics/mcp-server"]}]

# Server port
PORT=3000
```

### Verify the build

```bash
npx tsc --noEmit     # should exit with no errors
npm test             # should pass all 32 tests
```

---

## 2. Running the System

### First time: Set up self-hosted Trigger.dev

Follow the full guide in [docs/trigger-dev-self-hosted.md](./trigger-dev-self-hosted.md), or the quick version:

```bash
# Clone and start the Trigger.dev platform (Docker)
git clone https://github.com/triggerdotdev/docker.git trigger-dev-local
cd trigger-dev-local && ./start.sh -d

# Open http://localhost:3040, create a project, copy the secret key
# Paste TRIGGER_API_URL, TRIGGER_SECRET_KEY, and TRIGGER_PROJECT_REF into your .env
```

### First time: Login the CLI to your local instance

The Trigger.dev CLI needs a one-time login to your self-hosted instance (this saves a token locally):

```bash
npm run trigger:login
```

This opens your browser to `http://localhost:3040` for authentication. Once approved, the CLI stores the token and you won't need to login again.

### Start the system

You need three processes running:

```bash
# Terminal 1 — Trigger.dev platform (if not already running)
cd trigger-dev-local && docker compose up -d

# Terminal 2 — Trigger.dev dev worker (connects tasks to local platform)
npm run trigger:dev

# Terminal 3 — API server (HTTP endpoints)
npm run dev
```

The API server starts at `http://localhost:3001`. The Trigger.dev dashboard is at `http://localhost:3040`.

### Available npm scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start API server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run trigger:login` | One-time login to self-hosted Trigger.dev |
| `npm run trigger:dev` | Start Trigger.dev local dev worker |

---

## 3. Sending Your First Message

### Step 1 — Send a message

```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage": "How is our VIP cohort performing this quarter?"}'
```

Response:

```json
{
  "runId": "run_abc123",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "triggered",
  "message": "Pipeline started. Use GET /status/:runId to track progress."
}
```

### Step 2 — Poll for the result

```bash
curl http://localhost:3001/status/run_abc123
```

Response (while running):

```json
{
  "runId": "run_abc123",
  "status": "EXECUTING",
  "output": null,
  "createdAt": "2026-03-03T10:30:00.000Z",
  "updatedAt": "2026-03-03T10:30:05.000Z",
  "finishedAt": null
}
```

Response (completed):

```json
{
  "runId": "run_abc123",
  "status": "COMPLETED",
  "output": {
    "formattedResponse": "Your VIP cohort engagement is up 12% this quarter...",
    "notifications": [],
    "trace": [
      { "phase": "grounding", "durationMs": 1200 },
      { "phase": "cognition", "durationMs": 2400 },
      { "phase": "agency", "durationMs": 5100 },
      { "phase": "interface", "durationMs": 800 }
    ]
  },
  "createdAt": "2026-03-03T10:30:00.000Z",
  "updatedAt": "2026-03-03T10:30:10.000Z",
  "finishedAt": "2026-03-03T10:30:10.000Z"
}
```

### Step 3 — Check the Trigger.dev dashboard

Open `http://localhost:3040` to see the full run timeline, logs per stage, model usage, and token counts.

---

## 4. API Reference

### GET /health

Health check with system stats.

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-03-03T10:30:00.000Z",
  "agents": 1,
  "sessions": 0,
  "memory": { "learnings": 0, "decisions": 0, "cacheKeys": 0 }
}
```

### POST /message

Trigger the full pipeline with a marketer message.

```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage": "Analyze churn in the free-trial segment", "sessionId": "optional-id"}'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userMessage` | string | Yes | The marketer's message (min 1 char) |
| `sessionId` | string | No | Session ID for conversation continuity (auto-generated if omitted) |

### GET /status/:runId

Get pipeline run status and output.

```bash
curl http://localhost:3001/status/run_abc123
```

### GET /session/:sessionId/history

Get conversation history for a session (up to 50 messages).

```bash
curl http://localhost:3001/session/550e8400-e29b-41d4-a716-446655440000/history
```

### DELETE /session/:sessionId

Clear a session's short-term memory.

```bash
curl -X DELETE http://localhost:3001/session/550e8400-e29b-41d4-a716-446655440000
```

### GET /agents

List all registered sub-agent plugins.

```bash
curl http://localhost:3001/agents
```

```json
{
  "agents": [
    {
      "id": "cohort-monitor",
      "name": "Cohort Monitor",
      "description": "Analyzes audience cohort metrics...",
      "capabilities": ["cohort-analysis", "engagement-tracking", "retention-analysis", "churn-detection", "ltv-estimation"]
    }
  ]
}
```

### GET /memory/stats

Get memory statistics.

```bash
curl http://localhost:3001/memory/stats
```

```json
{
  "shortTerm": { "activeSessions": 3 },
  "longTerm": { "learnings": 15, "decisions": 42, "cacheKeys": 8 }
}
```

---

## 5. Creating a Custom Sub-Agent

### Step 1 — Create the plugin file

Create `src/trigger/sub-agents/plugins/my-agent.ts`:

```typescript
import { z } from "zod";
import { tool, type Tool } from "ai";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext } from "../../../core/types.js";

// Define input/output schemas
const MyInput = z.object({
  query: z.string().describe("What to analyze"),
  depth: z.enum(["quick", "thorough"]).default("thorough"),
});

const MyOutput = z.object({
  analysis: z.string(),
  confidence: z.number(),
  recommendations: z.array(z.string()),
});

export class MyAgent extends BaseSubAgent {
  id = "my-agent";
  name = "My Agent";
  description = "Describe what this agent does";
  version = "1.0.0";
  capabilities = ["my-capability-1", "my-capability-2"];

  inputSchema = MyInput;
  outputSchema = MyOutput;

  constructor() {
    super(
      "anthropic:balanced",                  // preferred model
      ["openai:balanced", "google:balanced"], // fallbacks
      10,                                     // max reasoning steps
      0.2                                     // temperature
    );
  }

  getSystemPrompt(context: ExecutionContext): string {
    return `You are ${this.name} for ${context.brandIdentity.name}.
Tone: ${context.brandIdentity.voice.tone}

Respond with JSON matching: { analysis, confidence, recommendations[] }`;
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    return {
      fetchData: tool({
        description: "Fetch data for analysis",
        inputSchema: z.object({ source: z.string() }),
        execute: async ({ source }) => {
          // Your tool implementation here
          return { data: `Results from ${source}` };
        },
      }),
    };
  }
}

// Auto-register on import
import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new MyAgent());
```

### Step 2 — Register the plugin

Add the import to `src/trigger/sub-agents/plugins/index.ts`:

```typescript
import "./my-agent.js";
```

### Step 3 — Verify

Restart the dev server and check:

```bash
curl http://localhost:3001/agents
```

Your agent should appear in the list. The Cognition agent can now assign subtasks with `agentId: "my-agent"`, and the Agency stage will route them through your plugin.

### Model aliases available

| Alias | Anthropic | OpenAI | Google |
|-------|-----------|--------|--------|
| `provider:fast` | Haiku | GPT-4o-mini | Flash |
| `provider:balanced` | Sonnet | GPT-4o | Pro |
| `provider:powerful` | Opus | o3 | Pro |

---

## 6. Adding a Notification Channel

### Step 1 — Create the adapter

Create `src/channels/my-channel.ts`:

```typescript
import type { ChannelAdapter } from "./channel-interface.js";
import type { NotificationRequest, NotificationResult } from "../core/types.js";

export class MyChannel implements ChannelAdapter {
  readonly channel = "my-channel";

  isConfigured(): boolean {
    return !!process.env.MY_CHANNEL_API_KEY;
  }

  async send(request: NotificationRequest): Promise<NotificationResult> {
    // Your delivery logic here
    return { success: true, messageId: `my-${Date.now()}` };
  }
}

export const myChannel = new MyChannel();
```

### Step 2 — Register it

Add to `src/channels/index.ts`:

```typescript
import { myChannel } from "./my-channel.js";
channelRegistry.register(myChannel);
```

### Step 3 — Use it

Notifications with `channel: "my-channel"` will now route through your adapter.

### Delivery-stage Slack routing rules

- Admin human-review escalation goes to `SLACK_ADMIN_HITL_CHANNEL`.
- Admin/system failure monitoring (for failed subtasks) goes to `SLACK_ADMIN_MONITORING_CHANNEL`.
- Marketer human-review notifications go to `SLACK_MARKETERS_HITL_CHANNEL`.
- Marketer-facing monitoring issues/warnings go to `SLACK_MARKETERS_MONITORING_CHANNEL`.

---

## 7. Connecting MCP Servers

MCP (Model Context Protocol) lets you connect external tool servers to your agents.

### Option A — Environment variable

```bash
MCP_SERVERS=[{"name":"analytics","command":"npx","args":["-y","@analytics/mcp-server"]}]
```

### Option A2 — Hosted MAPP MCP shortcut

If you use the hosted MAPP MCP server, set:

```bash
MAPP_MCP_SERVER_MICHEL_URL=https://mapp-intelligence-mcp-remote.vercel.app
MAPP_MCP_SERVER_MICHEL_TOKEN=eyJ...
```

The platform auto-registers this as MCP server name `mapp-michel`, which matches the learned routes that target `mcp-fetcher`.

### Option B — Programmatic

```typescript
import { mcpManager } from "./tools/mcp-client.js";

mcpManager.addServer({
  name: "analytics",
  command: "npx",
  args: ["-y", "@analytics/mcp-server"],
  env: { API_KEY: "..." },
});

// Get tools from the server (auto-connects on first call, cached after)
const tools = await mcpManager.getTools("analytics");

// Use in a sub-agent's getTools():
getTools(context) {
  return { ...tools, ...myOtherTools };
}
```

### Useful commands

```typescript
mcpManager.listServers();            // ["analytics", ...]
mcpManager.isConnected("analytics"); // true/false
await mcpManager.getAllTools();       // tools from all servers
await mcpManager.closeAll();         // clean shutdown
```

### MCP routes through `learned-routes.json`

The router can now dispatch directly to MCP tools using `routeType: "sub-agent"` and `agentId: "mcp-fetcher"`.

Example learned-route entry:

```json
{
  "id": "route-008",
  "capability": "analytics-kpi-benchmark-via-mcp",
  "routeType": "sub-agent",
  "agentId": "mcp-fetcher",
  "agentInputDefaults": {
    "serverName": "analytics",
    "toolName": "kpi_benchmark",
    "routeId": "route-008",
    "args": {
      "from": "{{input.from}}",
      "to": "{{input.to}}",
      "metric": "{{input.metric}}"
    }
  }
}
```

At runtime:
1. Unknown task matches a learned route.
2. Executor dispatches to `mcp-fetcher`.
3. `mcp-fetcher` resolves `{{input.*}}` placeholders from subtask input and executes the MCP tool.

---

## 8. Human-in-the-Loop Escalation

When an agent encounters a decision that requires human judgment, it can pause and wait for approval.

### How it works

1. The agent triggers the `escalate-to-human` task
2. Notifications are sent to the marketer (Slack) and admin (Email)
3. A durable waitpoint token is created via Trigger.dev
4. Execution **pauses** (no resources consumed while waiting)
5. A human reviews and completes the token via the Trigger.dev API
6. Execution **resumes** with the human's decision

### Completing an escalation

From your backend or Trigger.dev dashboard, complete the token:

```typescript
import { runs } from "@trigger.dev/sdk/v3";

// Complete with approval
await runs.completeWaitpoint(tokenId, {
  output: {
    approved: true,
    decision: "Campaign looks good — proceed",
    decidedBy: "marketer@company.com",
  },
});

// Or reject
await runs.completeWaitpoint(tokenId, {
  output: {
    approved: false,
    decision: "Too risky — hold until next week",
    decidedBy: "admin@company.com",
  },
});
```

### Timeout behavior

If no human responds within the timeout (default: 24 hours), the task resumes with:

```json
{
  "approved": false,
  "decision": "Escalation timed out — no human response received",
  "timedOut": true
}
```

---

## 9. Memory System

### Short-term memory (per session)

Stores conversation history and active context for each session. Lost on server restart.

```typescript
import { shortTermMemory } from "./memory/short-term.js";

// Add a message
shortTermMemory.addMessage(sessionId, { role: "user", content: "Hello" });

// Get recent history (default: last 10 messages)
const history = shortTermMemory.getRecentHistory(sessionId, 10);

// Store/retrieve session context
shortTermMemory.setContext(sessionId, "activeCampaign", "spring-sale");
shortTermMemory.getContext(sessionId, "activeCampaign"); // "spring-sale"

// Session management
shortTermMemory.has(sessionId);       // true/false
shortTermMemory.clear(sessionId);     // wipe session
shortTermMemory.sessionCount();       // number of active sessions
```

Max 50 messages per session (oldest are trimmed).

### Long-term memory (shared across sessions)

Stores synthesized learnings, past decisions, and brand context. Shared across all sessions.

```typescript
import { longTermMemory } from "./memory/long-term.js";

// Add learnings (auto-deduplicates)
longTermMemory.addLearning("Users prefer short emails on Tuesdays");

// Record decisions and outcomes
longTermMemory.addDecision(
  "Q1 Email Campaign",          // task
  "Sent on Tuesday morning",    // decision
  "25% higher open rate"        // outcome
);

// Cache brand context
longTermMemory.cacheContext("topSegment", "high-value-customers");
longTermMemory.getCachedContext("topSegment"); // "high-value-customers"

// Search (keyword-based substring matching)
longTermMemory.searchLearnings("email");       // matching learnings
longTermMemory.searchDecisions("campaign");    // matching decisions

// Stats
longTermMemory.stats(); // { learnings: 15, decisions: 42, cacheKeys: 8 }
```

Limits: 100 learnings, 200 decisions.

---

## 10. Out-of-Scope Requests

The cognition stage now enforces request-scope guardrails.

If the marketer asks for:
- competitor/rival-focused requests, or
- clearly non-marketing topics,

the request is rejected at cognition, and the workflow stops early (agency/interface stages are skipped).

### Behavior

- Pipeline returns a rejection `formattedResponse`
- No subtasks are executed
- No notifications are sent by default for this path

### Example prompts that should be rejected

- `Compare our Q1 campaign performance with our top competitor.`
- `Give me a strategy based on what our rivals are doing on Instagram.`
- `What is the weather in Berlin tomorrow?`
- `Give me a pasta recipe for dinner.`

### Example prompts that should be accepted

- `Analyze conversion trends by channel in the last 30 days.`
- `Show me my page impressions for the last 7 days.`
- `What segments are defined in my Mapp Intelligence account?`

---

## 11. Running Tests

### Commands

```bash
npm test                                    # run all tests once
npm run test:watch                          # watch mode
npx vitest run tests/unit/memory.test.ts    # run a single file
npx vitest run --reporter=verbose           # verbose output
```

### Test suite overview

| File | Tests | Covers |
|------|-------|--------|
| `tests/unit/context.test.ts` | 5 | knowledge/soul.md + guardrails.md parsing, defaults |
| `tests/unit/registry.test.ts` | 5 | Plugin register, lookup, capability search |
| `tests/unit/memory.test.ts` | 12 | Short-term + long-term memory CRUD and search |
| `tests/unit/errors.test.ts` | 6 | Custom error types, escalation builder |
| `tests/unit/model-router.test.ts` | 5 | Alias resolution, agent lookup, complexity selection |
| **Total** | **32** | |

### Writing a new test

Create a file in `tests/unit/` or `tests/integration/`:

```typescript
import { describe, it, expect } from "vitest";

describe("MyFeature", () => {
  it("does something", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Vitest picks up any `**/*.test.ts` file in the `tests/` directory.

---

## 12. Production Considerations

### Memory persistence

The current memory stores are in-process (lost on restart). For production:

- **Short-term memory** — replace with Redis for persistence + horizontal scaling
- **Long-term memory** — replace with a database or vector store for semantic search

### Model fallback

Every agent has a preferred model and a fallback chain. If all models fail, the result is `{ success: false }`. For critical paths, consider adding the `escalate-to-human` task as a last resort.

### Notification channels

Channels degrade gracefully — if a channel isn't configured (missing env var), `send()` returns `{ success: false }` with a descriptive error rather than throwing.

### Trigger.dev deployment

This project is configured for **self-hosted Trigger.dev** (no cloud dependency). For production:

- Deploy the Docker Compose stack on a VPS or dedicated server
- Use the official **Kubernetes Helm chart** for cluster deployments
- Configure a reverse proxy (nginx/Caddy) for HTTPS
- Set up proper Postgres backups for the Trigger.dev database

See [docs/trigger-dev-self-hosted.md](./trigger-dev-self-hosted.md) and the [official self-hosting docs](https://trigger.dev/docs/open-source-self-hosting) for details.

### Monitoring

- **Trigger.dev dashboard** — run timeline, logs, retries, status per task
- **API health endpoint** — `GET /health` for agent count, sessions, memory stats
- **Structured logs** — all agents and tasks emit JSON logs captured by Trigger.dev

---

## 13. Prompt Examples

Use these prompts in chat to validate route behavior.

### Mapp MCP Server prompts

These prompts should route to `mcp-fetcher` with `serverName: "mapp-michel"` (from learned routes):

- `List all available dimensions and metrics in Mapp Intelligence`
- `Show me my page impressions for the last 7 days`
- `What segments are defined in my Mapp Intelligence account?`
- `How many API calculations have I used this month?`

### Mapp Intelligence API template workflows (`api-fetcher`)

These prompts should route to `api-fetcher` using template-backed `apiWorkflow` routes and deterministic `mcp-builder-SKILL.md` preflight metadata:

- `Run the Cohorts Performance report in Mapp Intelligence.`  
  Expected target: `api-fetcher` (`workflowType: report-query`, template: `ref/intelligence-cohort-performance.json`)
- `Show cohort retention/conversion trend from Mapp Intelligence cohorts report.`  
  Expected target: `api-fetcher` (`workflowType: report-query`, template: `ref/intelligence-cohort-performance.json`)
- `Show channel performance for the last 7 days in Mapp Intelligence.`  
  Expected target: `api-fetcher` (`workflowType: analysis-query`, template: `ref/intelligence-channel-performance.json`)
- `Run Daily Report (GLOBAL) from Mapp Intelligence.`  
  Expected target: `api-fetcher` (`workflowType: report-query`, template: `ref/intelligence-daily-report.json`)
- `Analyze last 7 days KPI report from Mapp Intelligence.`  
  Expected target: `api-fetcher` (`workflowType: report-query`, template: `ref/intelligence-daily-report.json`)

Unchanged MCP-first prompts (must stay on `mcp-fetcher`):

- `List all available dimensions and metrics in Mapp Intelligence.`
- `What segments are defined in my Mapp Intelligence account?`

### Cohort Monitor prompts

These prompts should trigger the `cohort-monitor` sub-agent:

- `How is our VIP cohort performing this quarter?`
- `Analyze retention trend for the VIP cohort over the last 90 days`
- `Which cohort has the highest churn risk this month?`
- `Compare conversion performance between VIP and new-user cohorts`
- `Show engagement changes for our at-risk cohort in the last 30 days`
- `Give me a cohort-level summary of retention, conversion, and churn`

### Additional test-derived prompts

These are prompt patterns currently covered by unit tests and useful for smoke checks:

- `Get conversion metrics for Q1 campaign` (learned-route matching path)
- `Please fetch cohort retention by week` (route-pattern matching path)
- `Analyze conversion trend by channel over the last 30 days.` (in-scope cognition path)
- `Draft a launch announcement email` (LLM fallback path for non-data task)
- `Compare our campaign performance against our main competitor.` (guardrail rejection path)
- `What is the weather in Berlin tomorrow?` (guardrail rejection path)

### MCP Builder prompts

These prompts should trigger the Agency MCP-builder workflow (skill-guided response using `skills/mcp-builder-SKILL.md`):

- `Create an MCP server for our internal CRM API so agents can fetch customer lifecycle data.`
- `Build an MCP server integration for this REST API with OAuth and pagination.`
- `Help me expose our support platform API as MCP tools in TypeScript.`

### Universal Skill Creator prompts

These prompts should trigger the universal skill-creator workflow (using `skills/universal-agent-skill-creator.md`) and recommend saving learned output under `./skills/learned`:

- `Create a reusable skill for campaign QA reviews with clear pass/fail criteria.`
- `Build a new agent skill for onboarding marketers to KPI analysis workflows.`
- `Generate a skill template for handling weekly retention reporting requests.`

### Autonomous Skill Self-Learning prompts

Use these prompts to validate zero-HITL autonomous skill creation and reuse:

1. Trigger a reusable pattern:
- `How many API calculations have I used this month?`

2. Verify automatic skill materialization:
- Expected behavior: Agency emits `skillSuggestions`, execute stage persists candidate(s), and skill file is auto-created under `./skills/learned` using `skills/universal-agent-skill-creator.md`.

3. Verify cognition auto-adaptation on similar prompt:
- `Show me this month's API calculation usage summary and status.`
- Expected behavior: if matching candidate skill file is missing, cognition prepends a `skill-creator` subtask automatically before normal execution.
- If matching skill file already exists, cognition continues normal execution without extra skill-creation task.

Notes:
- Skill candidates are persisted in `knowledge/skill-candidates.json`.
- Skill approval is disabled for this autonomous lifecycle (`requiresApproval: false`).
- Materialized skills are written to `./skills/learned/*.md`.

### Alert-routing validation prompts

Use these to verify Slack alert routing behavior:

- `Review this campaign decision for compliance and approve before execution.`  
  Expected: `needsHumanReview` path, notification sent to `SLACK_MARKETERS_HITL_CHANNEL` or `SLACK_ADMIN_HITL_CHANNEL` based on severity.

- `Analyze daily KPI trends such as sessions, conversions, revenue, and retention.`  
  If it returns failed subtasks, expected: admin monitoring notification to `SLACK_ADMIN_MONITORING_CHANNEL`.

- `List all available dimensions and metrics in Mapp Intelligence`  
  If response includes marketer-facing warnings/issues, expected: monitoring notification to `SLACK_MARKETERS_MONITORING_CHANNEL`.

### Notification routing prompts (test-backed)

These prompts map to the current notification-policy tests and help verify the new channel split:

1. Marketer HITL (non-admin review):
   - Prompt: `Please review this campaign copy tone and wording before we publish.`
   - Expected: `needsHumanReview=true` with non-critical issue -> Slack to `SLACK_MARKETERS_HITL_CHANNEL`.

2. Admin HITL (critical/escalation review):
   - Prompt: `Review and approve this pipeline run; we detected a critical auth failure in a downstream analytics service.`
   - Expected: admin escalation human review -> Slack to `SLACK_ADMIN_HITL_CHANNEL`.

3. Marketer monitoring (warnings/issues, no failed subtask):
   - Prompt: `What segments are defined in my Mapp Intelligence account?`
   - Expected: if output includes warnings (e.g., naming/description quality issues), Slack to `SLACK_MARKETERS_MONITORING_CHANNEL`.

4. Admin monitoring (technical failure / failed subtask):
   - Prompt: `Show me my page impressions for the last 7 days`
   - Expected: if a technical error occurs (e.g., MCP tool unavailable, auth failure, failed subtask), Slack to `SLACK_ADMIN_MONITORING_CHANNEL`.

5. No Slack alert path:
   - Prompt: `Analyze conversion trend by channel over the last 30 days.`
   - Expected: successful run with no issues/failures -> no fallback Slack notification.

---

## 14. Agent Specs in Knowledge

Grounding, Cognition, Agency, and Interface agent prompt/specs are runtime-loaded from the `knowledge` folder.
Sub-agent specs are now also being migrated there (starting with `cohort-monitor`).

- `knowledge/agents/grounding/system-prompt.md`
- `knowledge/agents/grounding/decision-logic.md`
- `knowledge/agents/cognition/system-prompt.md`
- `knowledge/agents/cognition/decision-logic.md`
- `knowledge/agents/agency/system-prompt.md`
- `knowledge/agents/agency/decision-logic.md`
- `knowledge/agents/interface/system-prompt.md`
- `knowledge/agents/interface/decision-logic.md`
- `knowledge/sub-agents/cohort-monitor/system-prompt.md`
- `knowledge/sub-agents/cohort-monitor/decision-logic.md`
- `knowledge/sub-agents/api-fetcher/system-prompt.md`
- `knowledge/sub-agents/api-fetcher/decision-logic.md`
- `knowledge/sub-agents/mcp-fetcher/system-prompt.md`
- `knowledge/sub-agents/mcp-fetcher/decision-logic.md`
- `knowledge/skill-candidates.json` (persistent reusable skill recommendations from Agency)

How it works:

- `src/agents/grounding-agent.ts` loads the system prompt from `knowledge/agents/grounding/system-prompt.md`.
- `src/agents/cognition-agent.ts` loads the system prompt from `knowledge/agents/cognition/system-prompt.md`.
- `src/agents/agency-agent.ts` loads the system prompt from `knowledge/agents/agency/system-prompt.md`.
- `src/agents/interface-agent.ts` loads the system prompt from `knowledge/agents/interface/system-prompt.md`.
- `src/tools/agent-spec-loader.ts` handles file loading, placeholder interpolation (`{{KEY}}`), and fallback to hardcoded prompt if the file is missing/empty.
- `src/trigger/ground.ts` remains authoritative for parse/fallback decision logic; the markdown decision file mirrors behavior for human maintainability.
- `src/trigger/think.ts` + `src/trigger/cognition-guardrails.ts` remain authoritative for cognition parse fallback and deterministic out-of-scope rejection logic.
- `src/trigger/execute.ts` + `src/trigger/execute-routing.ts` remain authoritative for Agency execution routing, summarization, and fallback behavior. Autonomous skill persistence is intentionally not in the critical path.
- `src/trigger/think.ts` prunes redundant synthesis-only `general/assistant` subtasks for safe single-route deterministic plans.
- `src/trigger/execute.ts` includes deterministic fast paths for safe single-route deterministic executions: it skips the Agency summary model call and also skips redundant synthesis-only subtasks when they only depend on a successful deterministic route task.
- `src/trigger/skill-learner.ts` + `src/trigger/skill-learning.ts` run asynchronous post-execution skill filtering/materialization (`max 1` suggestion per run with anti-spam locking).
- `src/trigger/orchestrate.ts` now queues `pipeline-skill-learner` in fire-and-forget mode after Agency stage and proceeds directly to Interface.
- `src/routing/skill-candidates-store.ts` is authoritative for skill recommendation persistence, prompt-match scoring, and materialization-state checks.
- `src/trigger/universal-skill-creator.ts` is authoritative for deterministic autonomous skill-file materialization under `./skills/learned`.
- `src/trigger/deliver.ts` + `src/trigger/deliver-notifications.ts` + `src/trigger/delivery-fidelity.ts` remain authoritative for Interface rendering, notification routing, and fidelity safeguards.
- `src/trigger/sub-agents/plugins/cohort-monitor.ts` remains authoritative for current mock-first sub-agent execution behavior.
- `src/trigger/sub-agents/plugins/api-fetcher.ts` remains authoritative for deterministic learned-route fetch execution behavior.
- `src/trigger/sub-agents/plugins/mcp-fetcher.ts` remains authoritative for deterministic MCP tool execution, hydration, and output shaping behavior.

Extension pattern for future agents:

1. Add a new folder under `knowledge/agents/<agent-id>/`.
2. Add `system-prompt.md` (and optional `decision-logic.md`).
3. Use `loadAgentPromptSpec()` in the corresponding agent class with a safe fallback string.

---

## 15. Learned Routes DB + Admin Observability

The platform now supports DB-backed learned routes for better observability and admin operations.

### Env vars

- `DATABASE_URL`: Postgres connection string. When set, learned routes are loaded from DB.
- `LEARNED_ROUTES_DUAL_WRITE_JSON`: `true|false`. If `true`, DB writes are mirrored to `knowledge/learned-routes.json` during migration.
- `ADMIN_ALLOWED_IPS`: comma-separated allowlist for `/admin/*` access (e.g., `127.0.0.1,::1`).
- `ADMIN_API_TOKEN`: bearer token fallback for `/admin/*` access when IP is not allowlisted.

### Admin API endpoints

- `GET /admin/health`
- `GET /admin/routes`
- `GET /admin/routes/:routeId`
- `POST /admin/routes`
- `PUT /admin/routes/:routeId`
- `DELETE /admin/routes/:routeId`
- `GET /admin/events`
- `GET /admin/runs/summary`
- `POST /admin/backfill/import` (JSON -> DB)
- `POST /admin/backfill/export` (DB -> JSON)

### Backfill scripts

- `npm run routes:backfill` (imports `knowledge/learned-routes.json` into DB)
- `npm run routes:export` (exports DB routes to JSON backup)

### Separate admin app

- Start admin UI:
  - `npm run admin:ui`
- Open:
  - `http://localhost:4174`
- Configure API base and token in the UI to manage routes/events.

Sub-agent pattern:

1. Add a folder under `knowledge/sub-agents/<sub-agent-id>/`.
2. Add `system-prompt.md` and `decision-logic.md`.
3. Load prompt at runtime in the sub-agent plugin with `loadAgentPromptSpec()` and keep execution logic deterministic/safe in code.
