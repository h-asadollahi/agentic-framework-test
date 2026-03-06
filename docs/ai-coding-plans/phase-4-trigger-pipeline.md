# Phase 4: Trigger.dev Pipeline

## What was built

This phase wires the agent logic (Phase 3) into trigger.dev tasks, creating the durable orchestration pipeline. Each guardrail stage is a separate trigger.dev task, coordinated by a top-level orchestrator task.

### Files created

| File | Purpose |
|------|---------|
| `trigger.config.ts` | Trigger.dev project configuration (runtime, retries, task directory) |
| `src/trigger/orchestrate.ts` | Top-level pipeline task — coordinates all 4 stages |
| `src/trigger/ground.ts` | Grounding stage task — wraps GroundingAgent |
| `src/trigger/think.ts` | Cognition stage task — wraps CognitionAgent |
| `src/trigger/execute.ts` | Agency stage task — wraps AgencyAgent (parallel sub-agents in Phase 5) |
| `src/trigger/deliver.ts` | Interface stage task — wraps InterfaceAgent |
| `src/trigger/notify.ts` | Notification task — dispatches to Slack/Email/Webhook channels |

### Pipeline Flow

```
POST /message { userMessage, sessionId }
       │
       ▼
orchestrate-pipeline (trigger.dev task)
       │
       ├── triggerAndWait → pipeline-ground
       │   └── GroundingAgent.execute() → GroundingResult
       │
       ├── triggerAndWait → pipeline-think
       │   └── CognitionAgent.execute() → CognitionResult (subtask plan)
       │
       ├── triggerAndWait → pipeline-execute
       │   └── AgencyAgent.execute() → AgencyResult
       │       (Phase 5: batch.triggerByTaskAndWait for parallel sub-agents)
       │
       ├── triggerAndWait → pipeline-deliver
       │   └── InterfaceAgent.execute() → DeliveryResult
       │
       └── trigger → send-notification (fire-and-forget, one per notification)
```

### How It Works

**`orchestrate-pipeline`** is the entry point. It calls each stage sequentially via `triggerAndWait()`, which:
- Creates a child task run in trigger.dev
- Waits for it to complete (with automatic retry if configured)
- Returns the typed output

Each stage wraps its corresponding agent:
1. Builds the input from the previous stage's output
2. Calls `agent.execute(input, context)` which uses `generateText` with model fallback
3. Parses the JSON output into typed result (with graceful fallback if parsing fails)
4. Returns the result to the orchestrator

**Notifications** are fire-and-forget — the orchestrator triggers them with `trigger()` (not `triggerAndWait()`) so the pipeline response isn't blocked by notification delivery.

### Retry Configuration

| Task | Max Retries | Rationale |
|------|-------------|-----------|
| orchestrate-pipeline | 1 | Orchestrator doesn't retry; individual stages handle their own |
| pipeline-ground | 3 | Simple retrieval, likely to succeed on retry |
| pipeline-think | 2 | LLM reasoning; retry with potentially different model |
| pipeline-execute | 2 | Sub-agent execution; retry catches transient failures |
| pipeline-deliver | 2 | Formatting; retry with potentially different model |
| send-notification | 3 | External service calls; network errors are common |

### Observability

Every stage pushes a `TraceEntry` to the trace array:
- `phase`: which pipeline stage
- `action`: what happened
- `reasoning`: (cognition only) why the plan was decomposed this way
- `durationMs`: how long the stage took

The full trace is returned in `PipelineResult` so the API can expose it.

Additionally, trigger.dev provides:
- Real-time run timeline in the dashboard
- Per-task logs (via `logger.info/warn/error`)
- Automatic retry tracking
- Run status streaming via Realtime API

### What's next

Phase 5 will implement the sub-agent plugin system — a registry where domain-specific agents (like Cohort Monitor) register, and the execute task uses `batch.triggerByTaskAndWait()` to run them in parallel.
