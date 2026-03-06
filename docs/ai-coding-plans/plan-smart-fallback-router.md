# Plan: Smart Fallback Router — Self-Learning API Route Discovery

## Context

When the Cognition agent can't find a matching sub-agent for a user request, it assigns `agentId: "general"`. In `execute.ts`, the registry check fails (`subAgentRegistry.has("general") → false`) and the system falls back to a generic LLM call via `agencyAgent.execute()`. This produces unhelpful responses like "I don't have access to that data" — the LLM hallucinates or admits it can't help.

**Goal:** Instead of a blind LLM fallback, the system should:
1. Check if a previously learned route exists for this type of request
2. If not, ask the marketer via Slack HITL: "What API endpoint has this data?"
3. Save the learned route to a **human-readable JSON file** in the codebase
4. Immediately fetch real data from the provided API endpoint
5. Future identical requests skip the fallback entirely — cognition assigns to `api-fetcher` directly

**Inspired by:** Notion's Feedback Router template — routing rules that grow over time.

---

## Architecture

```
User: "What are the biggest CLV drivers?"
    ↓
Cognition → agentId: "general" (no matching sub-agent)
    ↓
Execute → registry.has("general") = false
    ↓
┌─ Smart Fallback Router ─────────────────────┐
│ 1. Check knowledge/learned-routes.json       │
│    → Match found? → api-fetcher sub-agent    │
│    → No match? ↓                             │
│ 2. Trigger Slack HITL (learn-route task)     │
│    → Ask marketer for API endpoint           │
│    → Parse URL, method, headers from reply   │
│    → Save to learned-routes.json             │
│    → Immediately fetch data from API         │
│    → Return real data to pipeline            │
│ 3. If Slack times out → LLM fallback         │
└──────────────────────────────────────────────┘
    ↓
Interface → formats real data for marketer

─── Future request (same type) ───
Cognition → sees learned route in prompt → agentId: "api-fetcher"
Execute → registry.has("api-fetcher") = true → fetches from saved endpoint
```

---

## Changes

### 1. NEW: `knowledge/learned-routes.json`

Human-readable, version-controlled file that accumulates learned routes over time. Developers can read, edit, and git-commit this file directly.

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-03-06T12:00:00Z",
  "routes": [
    {
      "id": "route-001",
      "capability": "customer-lifetime-value",
      "description": "Fetch CLV drivers and breakdown from analytics API",
      "matchPatterns": ["customer lifetime value", "clv", "ltv drivers"],
      "endpoint": {
        "url": "https://analytics.example.com/api/v1/clv",
        "method": "GET",
        "headers": { "Authorization": "Bearer {{ANALYTICS_API_KEY}}" },
        "queryParams": { "segment": "{{input.segment}}" }
      },
      "inputMapping": {
        "segment": "Customer segment to analyze (e.g. 'vip', 'new-users')"
      },
      "outputFormat": "json",
      "addedAt": "2026-03-06T12:00:00Z",
      "addedBy": "U12345 (via Slack)",
      "usageCount": 3,
      "lastUsedAt": "2026-03-06T15:30:00Z"
    }
  ]
}
```

**Template syntax:** `{{ENV_VAR}}` for secrets from process.env, `{{input.param}}` for runtime params. Secrets never stored in the file.

### 2. NEW: `src/routing/learned-routes-schema.ts`

Zod validation schemas for route data: `LearnedRouteSchema`, `EndpointSchema`, `LearnedRoutesFileSchema`. Exported types: `LearnedRoute`, `Endpoint`, `LearnedRoutesFile`.

### 3. NEW: `src/routing/learned-routes-store.ts`

Singleton store (same pattern as `subAgentRegistry`) that manages `knowledge/learned-routes.json`:

- `load()` — Read JSON from disk at startup
- `save()` — Write current state back to disk (after learning a new route)
- `findByCapability(description)` — Keyword-match against `matchPatterns`, scored by match length
- `addRoute(routeData)` — Add new route, assign ID, persist to disk
- `getById(routeId)` — Lookup by ID (used by api-fetcher)
- `incrementUsage(routeId)` — Bump usage counter
- `getSummary()` — Compact summary for cognition agent's system prompt (top 20 by usage)

### 4. NEW: `src/routing/route-learning-escalation.ts`

Slack HITL flow specialized for learning API endpoints (different from approve/reject escalation):

- `sendRouteLearningMessage(request)` — Block Kit message asking marketer for API endpoint info
- `pollForRouteInfo(channel, ts, timeout, interval)` — Polls thread, parses URLs/methods/headers from replies
- `postRouteLearningConfirmation(channel, ts, result)` — Posts success/failure in thread

**Slack message format:**
```
🔍 Unknown Data Request

The agent received a request it doesn't know how to fulfill:
> "What are the biggest drivers of Customer Lifetime Value?"

Reply in this thread with the API endpoint:
  URL: https://api.example.com/v1/clv (required)
  Method: GET (optional, defaults to GET)
  Headers: Authorization: Bearer {{API_KEY_NAME}} (optional)

⏱ Auto-skips in 30 minutes if no response.
```

**Reply parsing:** Extracts URL via regex, looks for method/header/param keywords in the reply text.

### 5. NEW: `src/trigger/learn-route.ts`

Trigger.dev task that orchestrates route learning:

1. Send Slack message via `sendRouteLearningMessage()`
2. Poll for reply via `pollForRouteInfo()`
3. If marketer provides endpoint → save to `learned-routes.json` via store
4. Immediately fetch data from the learned endpoint
5. Return fetched data as the subtask result
6. If timeout → return empty, let execute.ts fall back to LLM

### 6. NEW: `src/trigger/sub-agents/plugins/api-fetcher.ts`

Sub-agent plugin (same pattern as `cohort-monitor.ts`) that executes learned routes:

- Input: `{ routeId: string, params: Record<string, unknown>, description?: string }`
- Looks up route from `learnedRoutesStore.getById(routeId)`
- Resolves template variables (`{{ENV_VAR}}`, `{{input.param}}`)
- Executes HTTP fetch
- Returns response data
- Increments route usage counter

Auto-registers on import (same as cohort-monitor line 181).

### 7. MODIFY: `src/trigger/sub-agents/plugins/index.ts`

Add api-fetcher import:
```typescript
import "./cohort-monitor.js";
import "./api-fetcher.js";  // NEW
```

### 8. MODIFY: `src/trigger/execute.ts`

Replace the simple "general" fallback (lines 60-78) with smart routing:

```
if (registry.has(agentId)) →
  execute registered sub-agent (unchanged)
else →
  1. learnedRoutesStore.findByCapability(description)
     → match found? → execute api-fetcher with routeId
  2. no match → learnRouteTask.triggerAndWait()
     → learned + fetched? → use fetch result
  3. timeout/failure → agencyAgent.execute() (LLM fallback, unchanged)
```

### 9. MODIFY: `src/agents/cognition-agent.ts`

Inject learned routes into the system prompt so cognition assigns `api-fetcher` directly for known routes:

```
### Learned API Routes (use agentId: "api-fetcher")
- customer-lifetime-value (routeId: "route-001"): Fetch CLV drivers...
  Keywords: customer lifetime value, clv, ltv drivers
  Input: { "routeId": "route-001", "params": { ... } }
```

Import `learnedRoutesStore` and call `getSummary()` in `buildSystemPrompt()`. Inject after the existing sub-agent list (line 83) and before the "use general" instruction (line 85).

### 10. MODIFY: `src/trigger/orchestrate.ts`

Add `learnedRoutesStore.load()` at the start of the pipeline run to pick up any manual edits to the JSON file:

```typescript
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
// At start of orchestrateTask.run():
learnedRoutesStore.load();
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `knowledge/learned-routes.json` | **NEW** | Human-readable route storage (version-controlled) |
| `src/routing/learned-routes-schema.ts` | **NEW** | Zod schemas for route validation |
| `src/routing/learned-routes-store.ts` | **NEW** | Singleton store: load, save, find, add routes |
| `src/routing/route-learning-escalation.ts` | **NEW** | Slack HITL for learning API endpoints |
| `src/trigger/learn-route.ts` | **NEW** | Trigger.dev task orchestrating route learning |
| `src/trigger/sub-agents/plugins/api-fetcher.ts` | **NEW** | Sub-agent for executing learned routes |
| `src/trigger/sub-agents/plugins/index.ts` | **MODIFY** | Register api-fetcher |
| `src/trigger/execute.ts` | **MODIFY** | Smart fallback: check routes → HITL → LLM |
| `src/agents/cognition-agent.ts` | **MODIFY** | Inject learned routes into system prompt |
| `src/trigger/orchestrate.ts` | **MODIFY** | Reload routes at pipeline start |

---

## Implementation Order

**Phase 1 — Foundation** (no dependencies)
1. `learned-routes-schema.ts` — Zod schemas
2. `knowledge/learned-routes.json` — Empty initial file
3. `learned-routes-store.ts` — Store with load/save/find/add

**Phase 2 — Slack Integration**
4. `route-learning-escalation.ts` — Slack HITL for route learning
5. `learn-route.ts` — Trigger.dev task

**Phase 3 — Sub-Agent**
6. `api-fetcher.ts` — API fetcher plugin
7. `plugins/index.ts` — Register it

**Phase 4 — Pipeline Integration**
8. `execute.ts` — Smart fallback routing
9. `cognition-agent.ts` — Inject learned routes into prompt
10. `orchestrate.ts` — Store reload

---

## Verification

### Test 1: Empty state — first request triggers learning
```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"What are the biggest drivers of Customer Lifetime Value for us?"}'
```
1. Cognition assigns `agentId: "general"`
2. Execute checks learned routes → no match
3. Slack message appears asking for API endpoint
4. Reply in thread: `URL: https://api.example.com/v1/clv Method: GET`
5. Route saved to `knowledge/learned-routes.json` (verify file contents)
6. Data fetched and returned to marketer

### Test 2: Second request uses learned route
```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"Show me CLV breakdown by segment"}'
```
1. Cognition sees learned route in prompt → assigns `api-fetcher`
2. No Slack message this time — directly fetches from saved endpoint
3. Verify `usageCount` incremented in `learned-routes.json`

### Test 3: Timeout falls back to LLM
1. Trigger a request with no matching route
2. Don't reply in Slack within 30 minutes
3. Verify: falls back to LLM response (same as current behavior)

### Test 4: Manual route editing
1. Edit `knowledge/learned-routes.json` directly (add a new route)
2. Send a matching request
3. Verify: the manually added route is used without needing Slack HITL
