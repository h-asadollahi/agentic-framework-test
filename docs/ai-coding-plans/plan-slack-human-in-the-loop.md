# Plan: Slack-based Human-in-the-Loop via Thread Replies

## Context

The `escalateTask` (`src/trigger/escalate.ts`) currently sends fire-and-forget notifications and auto-rejects after a timeout (`wait.for({ seconds })`). There is **no mechanism** to receive human decisions — the task just sleeps and times out.

**Problem:** Trigger.dev v3's `wait.for()` only supports time-based blocking. There's no `wait.forToken()` or callback-based resumption. We need a way for humans to approve/reject escalations via Slack.

**Solution:** Thread-reply polling. The escalation task sends a rich Slack message, then polls for thread replies using `conversations.replies`. When a human replies with "approve" or "reject", the task picks it up and returns the decision. This approach is self-contained (runs entirely within the Trigger.dev worker), requires no public URLs or webhooks, and works with the existing `@slack/web-api` package.

---

## Architecture

```
Pipeline stage fails or needs approval
    ↓
escalateTask.trigger({ escalation, timeoutMinutes })
    ↓
Create Slack WebClient (from SLACK_BOT_TOKEN env var)
    ↓
Send rich escalation message to Slack channel
  (Block Kit: header, reason, severity, instructions)
    ↓
Get message timestamp (ts) + channel from response
    ↓
┌─ Poll loop (every 30s, up to timeout) ─┐
│  conversations.replies(channel, ts)     │
│  → Parse replies for keywords           │
│  → If decision found → break            │
│  → Else → wait.for({ seconds: 30 })     │
└─────────────────────────────────────────┘
    ↓
Post confirmation reply in thread
    ↓
Return EscalationResult { approved, decision, decidedBy, feedback, timedOut }
```

---

## Changes

### 1. NEW: `src/escalation/slack-escalation.ts`

Self-contained module for Slack-based escalation logic. Creates its own `WebClient` (from env var) so it works inside the Trigger.dev worker process.

**Exports:**
- `sendEscalationMessage(escalation)` → sends Block Kit message, returns `{ channel, ts }`
- `pollForDecision(channel, ts, timeoutSeconds, pollIntervalSeconds)` → polls thread replies in a loop
- `postDecisionConfirmation(channel, ts, decision)` → posts result in thread

**Message format (Block Kit):**
```
┌─────────────────────────────────────────┐
│ 🚨 Action Required: [task description]  │
│─────────────────────────────────────────│
│ Reason: [escalation reason]             │
│ Severity: [critical/warning/error]      │
│ Run ID: [run_xxx]                       │
│─────────────────────────────────────────│
│ Reply in this thread:                   │
│   ✅ "approve" — approve the action     │
│   ❌ "reject"  — reject the action      │
│   💬 Any other text — feedback/comment  │
│─────────────────────────────────────────│
│ ⏱ Auto-rejects in [X] minutes          │
└─────────────────────────────────────────┘
```

**Decision parsing logic:**
- Reply text contains "approve" / "approved" / "yes" / "lgtm" → approved
- Reply text contains "reject" / "rejected" / "no" / "deny" → rejected
- Any other reply → treat as feedback (continues polling, stores feedback)
- Extract `decidedBy` from Slack user ID in the reply

### 2. MODIFY: `src/trigger/escalate.ts`

Rewrite the `escalateTask` to use Slack thread-reply polling:

```typescript
export const escalateTask = task({
  id: "escalate-to-human",
  retry: { maxAttempts: 1 },
  run: async (payload: EscalationPayload): Promise<EscalationResult> => {
    const { escalation, timeoutMinutes = 60 } = payload;

    // 1. Send escalation message to Slack
    const { channel, ts } = await sendEscalationMessage(escalation);

    // 2. Also send email notification if configured
    if (escalation.notifyAdmin) {
      await notifyTask.trigger({ notification: emailNotification });
    }

    // 3. Poll for thread reply (decision)
    const decision = await pollForDecision(
      channel, ts, timeoutMinutes * 60, 30
    );

    // 4. Post confirmation in thread
    await postDecisionConfirmation(channel, ts, decision);

    return decision;
  },
});
```

**Key change:** Replace the `wait.for({ seconds: 24h })` + auto-reject with an active polling loop that checks for thread replies every 30 seconds. The `timeoutHours` field is replaced with `timeoutMinutes` (more practical for interactive workflows — default: 60 min).

### 3. MODIFY: `src/core/types.ts`

Add/update types:

```typescript
// Updated EscalationResult — add feedback field
export interface EscalationResult {
  approved: boolean;
  decision: string;
  decidedBy?: string;
  feedback?: string;      // NEW — human's additional comments
  slackThreadTs?: string; // NEW — reference to Slack thread
  timedOut: boolean;
}

// Updated EscalationPayload — use minutes instead of hours
export interface EscalationPayload {
  escalation: HumanEscalation;
  timeoutMinutes?: number;  // default: 60
}
```

### 4. MODIFY: `src/channels/slack-channel.ts`

Export a `createSlackClient()` factory function so the escalation module can create its own client in the Trigger.dev worker process:

```typescript
export function createSlackClient(): WebClient | null {
  const token = process.env.SLACK_BOT_TOKEN;
  return token ? new WebClient(token) : null;
}
```

The existing `SlackChannel` class stays unchanged — it's still used for regular notifications.

### 5. OPTIONAL: `src/index.ts`

Add a simple escalation status endpoint (useful for future dashboard):

```typescript
GET /escalations/active  → list active escalations (from in-memory tracking)
```

This is low-priority and can be skipped for the initial implementation.

---

## Slack Scopes Required

| Scope | Status | Purpose |
|-------|--------|---------|
| `chat:write` | ✅ Already configured | Send escalation messages |
| `channels:history` | ⚠️ **NEW — needs to be added** | Read thread replies via `conversations.replies` |
| `users:read` | 🔲 Optional | Resolve Slack user ID → display name for `decidedBy` |

The user will need to add `channels:history` to their Slack app at api.slack.com/apps and reinstall.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/escalation/slack-escalation.ts` | **NEW** | Slack thread-based escalation: send message, poll replies, parse decisions |
| `src/trigger/escalate.ts` | **MODIFY** | Rewrite to use `slack-escalation.ts` polling instead of blind `wait.for()` |
| `src/core/types.ts` | **MODIFY** | Add `EscalationResult.feedback`, `EscalationResult.slackThreadTs`, update payload |
| `src/channels/slack-channel.ts` | **MODIFY** | Export `createSlackClient()` factory function |

---

## Verification

### Pre-requisite
Add `channels:history` scope to the Slack app at api.slack.com/apps → OAuth & Permissions → Scopes → reinstall app.

### Test 1: Manual escalation trigger
```bash
# Send a test message that should trigger escalation (or trigger directly)
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"Escalate: I need approval to launch the Q1 campaign"}'
```

### Test 2: Approve via Slack thread reply
1. Watch the Slack channel for the escalation message
2. Reply "approve" in the message thread
3. Verify: the escalation task detects the reply within 30 seconds
4. Verify: confirmation message appears in the thread
5. Verify: task returns `{ approved: true, timedOut: false }`

### Test 3: Reject via Slack thread reply
1. Trigger another escalation
2. Reply "reject" in the thread
3. Verify: task returns `{ approved: false, timedOut: false }`

### Test 4: Timeout
1. Trigger escalation with short timeout (e.g., 2 minutes)
2. Don't reply
3. Verify: task auto-rejects after timeout
4. Verify: timeout notice posted in thread

### Test 5: Feedback then decision
1. Trigger escalation
2. Reply "can you provide more details?" (non-decision text)
3. Verify: task continues polling (stores as feedback)
4. Reply "approve"
5. Verify: task picks up the approval with feedback attached
