# Phase 7: API Server, Memory & Testing

## What was built

This final phase ties everything together with an HTTP API, a memory layer, and a comprehensive test suite.

### Files created / modified

| File | Purpose |
|------|---------|
| `src/index.ts` | Hono HTTP API server with pipeline, session, and agent endpoints |
| `src/memory/short-term.ts` | Per-session conversation history and context store |
| `src/memory/long-term.ts` | Cross-session learnings, decisions, and brand context cache |
| `vitest.config.ts` | Vitest configuration |
| `tests/unit/context.test.ts` | Tests for soul.md / guardrails.md parsing |
| `tests/unit/registry.test.ts` | Tests for the sub-agent plugin registry |
| `tests/unit/memory.test.ts` | Tests for short-term and long-term memory |
| `tests/unit/errors.test.ts` | Tests for custom error types and escalation builder |
| `tests/unit/model-router.test.ts` | Tests for model alias resolution and routing |
| `package.json` | **Updated** — added `@hono/node-server` dependency |

---

## API Server

The Hono API server exposes the following endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — agent count, session count, memory stats |
| `POST` | `/message` | Send a marketer message — triggers the pipeline |
| `GET` | `/status/:runId` | Get pipeline run status and output |
| `GET` | `/session/:sessionId/history` | Get conversation history for a session |
| `DELETE` | `/session/:sessionId` | Clear a session's short-term memory |
| `GET` | `/agents` | List all registered sub-agent plugins |
| `GET` | `/memory/stats` | Get memory statistics |

### POST /message

```json
{
  "userMessage": "What's our top-performing cohort this quarter?",
  "sessionId": "optional-session-id"
}
```

Response:

```json
{
  "runId": "run_abc123",
  "sessionId": "generated-uuid",
  "status": "triggered",
  "message": "Pipeline started. Use GET /status/:runId to track progress."
}
```

The message is stored in short-term memory and the pipeline is triggered via `tasks.trigger("orchestrate-pipeline", ...)`. The response returns immediately with a run ID for polling.

### GET /status/:runId

Uses `runs.retrieve(runId)` to get the pipeline run status from trigger.dev. Returns status, output, and timestamps.

---

## Memory Layer

### Short-Term Memory

Per-session, in-memory conversation store.

```
shortTermMemory
  ├── get(sessionId)              → ShortTermMemory
  ├── addMessage(sessionId, msg)  → void
  ├── getRecentHistory(id, n)     → Message[]
  ├── setContext(id, key, value)  → void
  ├── getContext(id, key)         → unknown
  ├── clear(sessionId)            → void
  ├── has(sessionId)              → boolean
  └── sessionCount()              → number
```

- Maximum 50 messages per session (oldest trimmed)
- Active context map for session-scoped state
- In production: replace with Redis for persistence + horizontal scaling

### Long-Term Memory

Cross-session knowledge accumulation.

```
longTermMemory
  ├── addLearning(text)            → void (deduplicates)
  ├── addDecision(task, dec, out)  → void
  ├── cacheContext(key, value)     → void
  ├── searchLearnings(query)       → string[]
  ├── searchDecisions(query)       → Decision[]
  ├── stats()                      → { learnings, decisions, cacheKeys }
  └── reset()                      → void
```

- Limits: 100 learnings, 200 decisions
- Keyword-based search (substring matching)
- In production: replace with a vector store for semantic search

---

## Test Suite

32 tests across 5 test files, all passing.

### Test breakdown

| File | Tests | What it covers |
|------|-------|----------------|
| `context.test.ts` | 4 | soul.md parsing, guardrails.md parsing, default fallbacks |
| `registry.test.ts` | 5 | Plugin registration, lookup, capability search, summary |
| `memory.test.ts` | 12 | Session CRUD, message history, context, dedup, search, stats |
| `errors.test.ts` | 6 | All custom error types, escalation builder |
| `model-router.test.ts` | 5 | Alias resolution, agent lookup, complexity selection |

### Running tests

```bash
npm test              # single run
npm run test:watch    # watch mode
```

---

## Full Project Summary

All 7 phases are now complete:

| Phase | What | Key files |
|-------|------|-----------|
| 1 | Foundation | `package.json`, `tsconfig.json`, `core/types.ts`, `core/errors.ts` |
| 2 | AI Providers | `config/providers.ts`, `config/models.ts`, `providers/model-router.ts` |
| 3 | Agent Logic | `agents/base-agent.ts`, grounding/cognition/agency/interface agents |
| 4 | Trigger.dev Pipeline | `trigger/orchestrate.ts`, ground/think/execute/deliver/notify tasks |
| 5 | Sub-Agent System | `trigger/sub-agents/registry.ts`, base-sub-agent, cohort-monitor plugin |
| 6 | Notifications | `channels/` adapters, `tools/mcp-client.ts`, `trigger/escalate.ts` |
| 7 | API + Memory + Tests | `src/index.ts`, `memory/`, `tests/unit/` |

### To run the system

```bash
# 1. Copy and fill in environment variables
cp .env.example .env

# 2. Start trigger.dev local dev
npm run trigger:dev

# 3. Start the API server
npm run dev

# 4. Send a message
curl -X POST http://localhost:3000/message \
  -H 'Content-Type: application/json' \
  -d '{"userMessage": "How is our top cohort performing?"}'
```
