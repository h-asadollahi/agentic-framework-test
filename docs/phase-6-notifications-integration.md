# Phase 6: Notifications & Integration

## What was built

This phase implements the notification delivery system, MCP client integration, and human-in-the-loop escalation mechanism.

### Files created / modified

| File | Purpose |
|------|---------|
| `src/channels/channel-interface.ts` | Channel adapter interface + channel registry |
| `src/channels/slack-channel.ts` | Slack adapter via `@slack/web-api` |
| `src/channels/email-channel.ts` | Email adapter via SendGrid (`@sendgrid/mail`) |
| `src/channels/webhook-channel.ts` | Generic webhook adapter via `fetch` with HMAC signing |
| `src/channels/index.ts` | Barrel file — registers all adapters |
| `src/tools/mcp-client.ts` | MCP Client Manager — connects to external tool servers |
| `src/trigger/escalate.ts` | Human-in-the-loop task using `wait.forToken()` |
| `src/trigger/notify.ts` | **Updated** — now dispatches through the channel registry |
| `.env.example` | **Updated** — added new env vars for channels + escalation |

---

## Channel Adapter Pattern

Every notification channel implements `ChannelAdapter`:

```typescript
interface ChannelAdapter {
  channel: string;                                    // "slack" | "email" | "webhook"
  send(request: NotificationRequest): Promise<NotificationResult>;
  isConfigured(): boolean;                            // checks env vars
}
```

The `channelRegistry` holds all registered adapters. The `notifyTask` looks up the right adapter by the notification's `channel` field and calls `send()`.

### Slack Channel

- Uses `@slack/web-api` `WebClient`
- Requires `SLACK_BOT_TOKEN` env var (bot token with `chat:write` scope)
- Falls back to `SLACK_DEFAULT_CHANNEL` if no recipient specified
- Critical-priority notifications get a red attachment bar

### Email Channel

- Uses `@sendgrid/mail`
- Requires `SENDGRID_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`
- Generates HTML email with priority-coloured header
- Returns the SendGrid message ID for tracking

### Webhook Channel

- Pure `fetch` POST to any URL
- Recipient field = webhook URL
- Optional HMAC-SHA256 signing via `WEBHOOK_SECRET` env var (`X-Webhook-Signature` header)
- 10-second timeout via `AbortSignal.timeout()`
- Always "configured" since URLs come per-notification

### Updated Notify Task

The `send-notification` trigger.dev task was updated from placeholder switch/case to:

```
notification.channel → channelRegistry.get(channel) → adapter.send(request)
```

This means adding a new channel is just:
1. Implement `ChannelAdapter`
2. Register it in `src/channels/index.ts`

---

## MCP Client Manager

The `MCPClientManager` manages connections to external Model Context Protocol servers.

```
mcpManager
  ├── addServer(config)        → register server config
  ├── getTools(name)           → connect + cache + return tools
  ├── getAllTools()             → tools from all servers
  ├── closeAll()               → clean shutdown
  ├── listServers()            → configured server names
  └── isConnected(name)        → check connection status
```

**Configuration** via `MCP_SERVERS` env var (JSON array):

```json
[
  {
    "name": "analytics",
    "command": "npx",
    "args": ["-y", "@analytics/mcp-server"]
  }
]
```

Uses `@ai-sdk/mcp` for client creation and `@ai-sdk/mcp/mcp-stdio` for stdio transport. Connections are cached and tools are returned as AI SDK `Tool` objects that can be passed directly to `generateText()`.

---

## Human-in-the-Loop Escalation

The `escalate-to-human` task implements a durable pause-and-resume pattern:

```
Agent detects need for human input
       │
       ▼
escalateTask.triggerAndWait({
  escalation: { runId, taskDescription, reason, severity, ... }
})
       │
       ├── 1. Send Slack notification to marketer
       ├── 2. Send Email notification to admin
       │
       ├── 3. wait.createToken({ timeout: "24h" })
       │      ↓
       │   Task PAUSED durably (no resources consumed)
       │      ↓
       │   Human reviews in dashboard or via API
       │      ↓
       │   wait.completeToken(token, { approved, decision, decidedBy })
       │      ↓
       │   Task RESUMES with human's decision
       │
       └── 4. Returns { approved, decision, decidedBy, timedOut }
```

**Key details:**
- Uses `wait.createToken()` + `wait.forToken()` for durable waiting
- Tokens are tagged for querying: `escalation`, `severity:critical`, `run:<id>`
- Default 24h timeout — returns `timedOut: true` if no response
- Notifications are fire-and-forget (don't block the wait)
- No retries on escalation tasks (max 1 attempt)

**Completing an escalation** (from external API or dashboard):

```typescript
import { wait } from "@trigger.dev/sdk/v3";

await wait.completeToken(tokenId, {
  approved: true,
  decision: "Approved — campaign looks good",
  decidedBy: "marketer@company.com",
});
```

---

## Environment Variables Added

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | For Slack | Slack bot token with `chat:write` scope |
| `SLACK_DEFAULT_CHANNEL` | No | Fallback channel (default: `#marketing-alerts`) |
| `SENDGRID_API_KEY` | For Email | SendGrid API key |
| `EMAIL_FROM_ADDRESS` | No | Sender email (default: `noreply@example.com`) |
| `EMAIL_FROM_NAME` | No | Sender name (default: `Marketing Agent`) |
| `WEBHOOK_SECRET` | No | HMAC signing secret for webhooks |
| `MARKETER_SLACK_CHANNEL` | No | Escalation Slack channel |
| `ADMIN_EMAIL` | No | Escalation email recipient |
| `MCP_SERVERS` | No | JSON array of MCP server configs |

---

## What's next

Phase 7 will implement:
- Hono API server (`POST /message`, `GET /status/:runId`)
- Short-term + long-term memory layer
- soul.md parsing integration
- Unit + integration tests
