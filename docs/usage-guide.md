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
10. [Running Tests](#10-running-tests)
11. [Production Considerations](#11-production-considerations)

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
SLACK_DEFAULT_CHANNEL=#marketing-alerts

# Optional — Email notifications (SendGrid)
SENDGRID_API_KEY=SG...
EMAIL_FROM_ADDRESS=agents@company.com
EMAIL_FROM_NAME=Marketing Agent

# Optional — Webhook notifications
WEBHOOK_SECRET=your-shared-secret

# Optional — Escalation recipients
MARKETER_SLACK_CHANNEL=#marketing-alerts
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

---

## 7. Connecting MCP Servers

MCP (Model Context Protocol) lets you connect external tool servers to your agents.

### Option A — Environment variable

```bash
MCP_SERVERS=[{"name":"analytics","command":"npx","args":["-y","@analytics/mcp-server"]}]
```

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

## 10. Running Tests

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
| `tests/unit/context.test.ts` | 4 | soul.md + guardrails.md parsing, defaults |
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

## 11. Production Considerations

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
