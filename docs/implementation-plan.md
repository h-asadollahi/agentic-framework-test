# Multi-Agent Marketing Platform — Implementation Plan

## Context

We're building a multi-agent system for a marketing platform, inspired by the framework from [productized.tech](https://productized.tech/writing/building-ai-agents-the-ai-is-the-easy-part). A marketer chats with a top-level orchestrator agent, which breaks tasks into smaller ones coordinated by four guardrail agents (Grounding, Cognition, Agency, Interface), each responsible for a dimension of agent intelligence. Sub-agents (e.g., Cohort Monitor, Journey Agent) are triggered as needed. The system supports multi-model fallback (Claude/OpenAI/Gemini), parallel execution, task status tracking, and human-in-the-loop escalation.

This is a **greenfield project** — the repo currently contains only `instructions.md`.

---

## Architecture Overview

```
Marketer Chat Input
       │
       ▼
┌─────────────────┐
│   Orchestrator   │  ← Top-level agent, manages pipeline
└────────┬────────┘
         │
    ┌────▼────┐
    │Grounding │  → Reads soul.md, brand identity, constraints
    └────┬────┘
         │
    ┌────▼────┐
    │Cognition │  → Decomposes goals, plans subtasks, applies judgment
    └────┬────┘
         │
    ┌────▼────┐
    │ Agency   │  → Executes plan, triggers sub-agents (parallel where possible)
    │          │    ├── Cohort Monitor Agent
    │          │    ├── Journey Agent (future)
    │          │    ├── Content Agent (future)
    │          │    └── ... (plugin registry)
    └────┬────┘
         │
    ┌────▼────┐
    │Interface │  → Formats output, triggers Notification Manager
    │          │    └── Notification Manager → Slack / Email / Webhook
    └────┬────┘
         │
         ▼
  Marketer receives response + notifications
```

---

## Trigger.dev Evaluation

### What is Trigger.dev?

[Trigger.dev](https://trigger.dev) is an open-source (Apache 2.0) platform for building and deploying durable background jobs and AI agent workflows. It provides the **execution infrastructure** layer — task queues, retries, parallel execution, observability, and real-time status streaming — so you can focus on agent logic.

### Why Trigger.dev fits this project (Recommended)

| Our Requirement | Trigger.dev Solution | Without Trigger.dev |
|-----------------|---------------------|---------------------|
| Task status tracking (Waiting/InProgress/Failed/Successful) | Built-in run status + Realtime API streams to frontend | Custom `TaskManager` + `EventBus` + manual state machine |
| Parallel sub-agent execution | `batch.triggerByTaskAndWait()` with concurrency controls | Custom `Promise.allSettled()` wrapper |
| Model fallback / retry on failure | Built-in retry with configurable backoff per task | Custom retry loop in `BaseAgent` |
| Human-in-the-loop | `waitForApproval()` — pauses task durably, resumes on approval | Custom `AwaitingHumanInput` state + polling/webhook |
| Observability (what steps taken, why) | Built-in tracing, logs, run timeline per task | Custom `TraceEntry[]` logging + pino |
| Long-running agent pipelines | Durable execution, no timeouts, checkpoint-resume | Risk of timeouts, need keep-alive infra |
| Scheduled/recurring tasks | Built-in cron schedules | External cron + custom scheduling |
| Real-time marketer updates | Realtime API streams run status to frontend | Custom WebSocket/SSE server |

### What Trigger.dev does NOT replace

- **Vercel AI SDK** — still needed for `generateText`, `tool()`, multi-model provider registry, MCP integration
- **Agent logic** — guardrail agents, system prompts, tool definitions, sub-agent plugin contracts
- **soul.md / brand identity** — still our domain logic
- **Notification channels** — Slack/Email adapters still needed (trigger.dev has alerts but not custom channel routing)

### Architecture with Trigger.dev

Trigger.dev becomes the **orchestration backbone**. Each agent stage becomes a trigger.dev `task()`. The pipeline is coordinated by an orchestrator task that calls guardrail tasks sequentially, and the Agency task uses `batch.triggerByTaskAndWait()` for parallel sub-agent execution.

```
Marketer sends message
       │
       ▼
┌──────────────────────────┐
│  trigger.dev: orchestrate │  ← top-level task, coordinates pipeline
│  (durable, tracked, real- │
│   time status to frontend)│
└────────────┬─────────────┘
             │
  ┌──────────▼──────────┐
  │ trigger.dev: ground  │  → task() — reads soul.md, brand context
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │ trigger.dev: think   │  → task() — goal decomposition, planning
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │ trigger.dev: execute │  → task() — triggers sub-agent tasks in parallel
  │  ├── batch.trigger   │    via batch.triggerByTaskAndWait()
  │  │  ├── cohort-check │
  │  │  ├── analytics    │
  │  │  └── ...          │
  └──────────┬──────────┘
             │
  ┌──────────▼──────────┐
  │ trigger.dev: deliver │  → task() — format output, send notifications
  └──────────┬──────────┘
             │
             ▼
  Marketer receives response + notifications
  (real-time status via Realtime API)
```

### Trade-offs

| Pros | Cons |
|------|------|
| Production-grade task queue, retries, observability for free | Adds platform dependency (cloud or self-hosted) |
| Eliminates custom TaskManager, EventBus, retry logic | Monthly cost for cloud ($30-$500+) |
| Real-time streaming to frontend out of the box | Learning curve for trigger.dev task model |
| Durable execution — no timeout worries | Self-hosted option requires Docker infra |
| Scales horizontally as sub-agents grow | Slightly more boilerplate per task definition |
| Built-in dashboard for monitoring runs | |

### Recommendation

**Use Trigger.dev as the orchestration layer + Vercel AI SDK for the AI layer.** This eliminates ~40% of custom infrastructure code (TaskManager, EventBus, retry logic, status tracking, observability) and gives us production-grade durability, real-time streaming, and a monitoring dashboard from day one. The two libraries complement each other perfectly — AI SDK handles model calls/tools, Trigger.dev handles execution coordination.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestration Layer | **Trigger.dev** | Durable execution, retries, parallel tasks, real-time status, observability |
| AI Layer | **Vercel AI SDK v6** | Multi-model support, tool calling, MCP integration, TypeScript-native |
| Agent Execution | AI SDK `generateText` inside trigger.dev `task()` | AI SDK for model calls, trigger.dev for execution lifecycle |
| Model Fallback | trigger.dev retry + explicit model fallback in agent logic | Two layers: infra retry + application-level model switching |
| Sub-Agents | Plugin registry + trigger.dev batch tasks | Each sub-agent is both a plugin and a trigger.dev task |
| Task State | Trigger.dev native run status | No custom state machine needed |
| Real-time Updates | Trigger.dev Realtime API | Stream task status to marketer's frontend |
| Guardrail Pipeline | Sequential trigger.dev tasks | Each stage awaits prior; parallelism within Agency via batch |
| Notifications | Channel adapter pattern | Triggered from the Interface/deliver task |
| Configuration | soul.md (brand) + .env (secrets) + TS configs (agent settings) | Separation of concerns |

---

## Project Structure

```
framework-agents/
├── package.json
├── tsconfig.json
├── trigger.config.ts                 # Trigger.dev project config
├── .env / .env.example
├── soul.md                           # Brand identity, personality, values, voice
├── knowledge/                        # Static knowledge base
│   ├── brand-guidelines.md
│   └── guardrails.md                 # Hard constraints / never-do rules
│
├── src/
│   ├── index.ts                      # API server entry (Express/Hono) — receives marketer messages
│   │
│   ├── config/
│   │   ├── providers.ts              # AI SDK provider registry (Claude/OpenAI/Gemini)
│   │   ├── models.ts                 # Per-agent model mapping & fallback chains
│   │   └── channels.ts              # Notification channel configs
│   │
│   ├── core/
│   │   ├── types.ts                  # All interfaces, enums, type contracts
│   │   ├── context.ts                # Execution context builder (soul.md, memory, guardrails)
│   │   ├── errors.ts                 # Custom error types & escalation helpers
│   │   └── logger.ts                 # Structured logging
│   │
│   ├── trigger/                      # ★ Trigger.dev task definitions
│   │   ├── orchestrate.ts            # Top-level pipeline task (Grounding→Cognition→Agency→Interface)
│   │   ├── ground.ts                 # Grounding guardrail task — soul.md, brand context
│   │   ├── think.ts                  # Cognition guardrail task — goal decomposition, planning
│   │   ├── execute.ts                # Agency guardrail task — parallel sub-agent execution
│   │   ├── deliver.ts                # Interface guardrail task — format output, notify
│   │   ├── notify.ts                 # Notification task — route to Slack/Email/Webhook
│   │   └── sub-agents/
│   │       ├── registry.ts           # Sub-agent plugin registry
│   │       ├── base-sub-agent.ts     # Base class for domain sub-agents
│   │       └── plugins/
│   │           └── cohort-monitor.ts # Sample plugin (also a trigger.dev task)
│   │
│   ├── agents/                       # Agent logic (AI SDK generateText wrappers)
│   │   ├── base-agent.ts             # Abstract base: model fallback, system prompt, tools
│   │   ├── grounding-agent.ts        # Grounding agent logic
│   │   ├── cognition-agent.ts        # Cognition agent logic
│   │   ├── agency-agent.ts           # Agency agent logic
│   │   └── interface-agent.ts        # Interface agent logic
│   │
│   ├── providers/
│   │   └── model-router.ts           # Model resolution & dynamic selection
│   │
│   ├── memory/
│   │   ├── short-term.ts             # Session-scoped conversation/task logs
│   │   └── long-term.ts             # Persistent synthesized learnings
│   │
│   ├── tools/
│   │   ├── mcp-client.ts            # MCP server connection manager
│   │   ├── notification-tools.ts     # AI SDK tool() wrappers for sending notifications
│   │   └── knowledge-tools.ts        # AI SDK tool() wrappers for soul.md, brand guidelines
│   │
│   └── channels/
│       ├── channel-interface.ts      # Abstract notification channel adapter
│       ├── slack-channel.ts
│       └── email-channel.ts
│
├── tests/
│   ├── unit/
│   └── integration/
│
└── docs/
    └── implementation-plan.md
```

**Key structural change**: The `src/trigger/` directory contains trigger.dev task definitions that wrap agent logic. The `src/agents/` directory contains the pure AI logic (model calls, system prompts, tools). This separates **orchestration concerns** (trigger.dev) from **intelligence concerns** (AI SDK).

---

## Core Types (src/core/types.ts)

### Task Status (managed by Trigger.dev)
Trigger.dev natively tracks run status: `QUEUED → EXECUTING → COMPLETED / FAILED / WAITING_FOR_DEPLOY`. We map custom states for agent-specific semantics:

```typescript
type AgentPhase = 'grounding' | 'cognition' | 'agency' | 'interface';
type SubAgentStatus = 'pending' | 'running' | 'retrying' | 'completed' | 'failed' | 'escalated';
```

### Key Interfaces
- **AgentConfig**: id, preferredModel, fallbackModels, maxSteps, autonomyLevel, trustBoundary
- **ExecutionContext**: sessionId, brandIdentity, guardrails, shortTermMemory, longTermMemory
- **BrandIdentity**: personality, values, voice (tone/style/neverSay), targetAudience
- **SubAgentPlugin**: id, capabilities, inputSchema (Zod), outputSchema (Zod), execute()
- **GuardrailConstraints**: neverDo[], alwaysDo[], brandVoiceRules[]
- **HumanEscalation**: runId, reason, severity, notifyMarketer, notifyAdmin
- **PipelinePayload**: userMessage, sessionId — input to the orchestrator task
- **PipelineResult**: formattedResponse, notifications[], trace[] — output from pipeline

---

## Agent Logic Layer (src/agents/)

Every agent extends `BaseAgent` which provides:
1. **Model fallback loop**: iterates preferred → fallback1 → fallback2; if all fail → throw for escalation
2. **Observability**: `onStepFinish` logs via `logger.taskLogger` (trigger.dev captures this automatically)
3. **Abstract methods** subclasses implement: `getTools()`, `buildSystemPrompt(context)`

```typescript
// src/agents/base-agent.ts — pure AI logic, no orchestration concerns
async execute(input: string, context: ExecutionContext): Promise<AgentResult> {
  const models = [this.config.preferredModel, ...this.config.fallbackModels];
  for (const modelId of models) {
    try {
      const result = await generateText({
        model: this.modelRouter.resolve(modelId),
        system: this.buildSystemPrompt(context),
        prompt: input,
        tools: this.getTools(),
        maxSteps: this.config.maxSteps,
      });
      return { success: true, output: result.text, modelUsed: modelId };
    } catch (error) {
      logger.warn(`Model ${modelId} failed, trying next...`);
      continue;
    }
  }
  throw new AllModelsFailed(this.config.id, models);
}
```

---

## Trigger.dev Orchestration Layer (src/trigger/)

Each guardrail stage is a trigger.dev `task()`. The orchestrator task calls them sequentially. Sub-agents run in parallel via `batch.triggerByTaskAndWait()`.

```typescript
// src/trigger/orchestrate.ts
import { task } from "@trigger.dev/sdk/v3";
import { groundTask } from "./ground";
import { thinkTask } from "./think";
import { executeTask } from "./execute";
import { deliverTask } from "./deliver";

export const orchestrateTask = task({
  id: "orchestrate-pipeline",
  retry: { maxAttempts: 2 },
  run: async (payload: { userMessage: string; sessionId: string }) => {
    // 1. Grounding — establish brand context & constraints
    const grounding = await groundTask.triggerAndWait({
      userMessage: payload.userMessage,
      sessionId: payload.sessionId,
    });

    // 2. Cognition — decompose into subtask plan
    const plan = await thinkTask.triggerAndWait({
      userMessage: payload.userMessage,
      groundingResult: grounding.output,
    });

    // 3. Agency — execute plan (parallel sub-agents inside)
    const results = await executeTask.triggerAndWait({
      subtasks: plan.output.subtasks,
      context: grounding.output.context,
    });

    // 4. Interface — format response, trigger notifications
    const response = await deliverTask.triggerAndWait({
      results: results.output,
      sessionId: payload.sessionId,
    });

    return response.output;
  },
});
```

```typescript
// src/trigger/execute.ts — Agency stage with parallel sub-agent execution
import { task, batch } from "@trigger.dev/sdk/v3";
import { cohortMonitorTask } from "./sub-agents/plugins/cohort-monitor";

export const executeTask = task({
  id: "execute-agency",
  run: async (payload: { subtasks: SubTask[]; context: ExecutionContext }) => {
    const independentTasks = payload.subtasks.filter(t => t.dependencies.length === 0);

    // Run independent sub-agents in parallel via trigger.dev batch
    const results = await batch.triggerByTaskAndWait(
      independentTasks.map(subtask => ({
        task: resolveSubAgentTask(subtask.agentId), // maps to trigger task
        payload: { input: subtask.input, context: payload.context },
      }))
    );

    return { results: results.runs.map(r => r.output) };
  },
});
```

**Human-in-the-loop** via trigger.dev's `wait.forToken()`:
```typescript
// Inside any task that needs human approval
const approval = await wait.forToken<{ approved: boolean }>({
  id: `escalation-${runId}`,
  timeout: "24h",
});
// Token is completed via API call when marketer/admin responds
```

---

## Model Assignment

| Agent | Preferred | Fallbacks | Rationale |
|-------|-----------|-----------|-----------|
| Orchestrator | Anthropic Opus | OpenAI GPT-4o, Google Pro | Complex coordination |
| Grounding | Anthropic Haiku | OpenAI Mini, Google Flash | Simple loading, speed |
| Cognition | Anthropic Sonnet | OpenAI o3, Google Pro | Planning needs reasoning |
| Agency | Anthropic Sonnet | OpenAI GPT-4o, Google Pro | Tool chaining |
| Interface | Anthropic Haiku | OpenAI Mini, Google Flash | Formatting, speed |
| Sub-agents | Per plugin config | Per plugin | Domain-specific |

---

## Sub-Agent Plugin System

Plugins implement `SubAgentPlugin` interface with:
- Zod input/output schemas for validation
- `capabilities` array for discovery
- `execute(input, context)` method

Registry supports: `register()`, `get()`, `findByCapability()`, `execute()`

**Future sub-agents** (from roadmap):
Journey Agent, Consumer Insights Agent, Segment Agent, Content Agent, Designer Agent, Scheduler Agent, Analytics Agent, Merchandiser Agent

---

## Human-in-the-Loop Escalation

When all model fallbacks fail or a critical error occurs:
1. `BaseAgent` throws an escalation error
2. Event bus emits `agent:escalation`
3. Listener triggers Notification Manager to:
   - Notify **marketer** via Slack (their preferred channel)
   - Notify **system admin** via Email (critical system alert)

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@trigger.dev/sdk` ^3.x | **Orchestration**: durable tasks, retries, batch execution, real-time streaming |
| `ai` ^6.0.0 | **AI Layer**: generateText, tool(), createProviderRegistry |
| `@ai-sdk/anthropic` | Claude models (Haiku, Sonnet, Opus) |
| `@ai-sdk/openai` | OpenAI models (GPT-4o-mini, GPT-4o, o3) |
| `@ai-sdk/google` | Gemini models (Flash, Pro) |
| `@ai-sdk/mcp` | MCP server integration |
| `@modelcontextprotocol/sdk` | MCP transport layer |
| `zod` | Schema validation for tool inputs/outputs and sub-agent contracts |
| `@slack/web-api` | Slack notification channel |
| `@sendgrid/mail` | Email notification channel |
| `dotenv` | Env var loading |
| `hono` | Lightweight API server (receives marketer messages, serves Realtime API) |
| `tsx` / `typescript` / `vitest` | Dev tooling |

**Removed** (now handled by trigger.dev): `ai-fallback`, `pino` (trigger.dev has built-in logging), custom EventBus, custom TaskManager.

---

## Implementation Phases

### Phase 1: Foundation & Trigger.dev Setup
- Project init (`package.json`, `tsconfig.json`, `.env.example`)
- `npx trigger.dev@latest init` — creates `trigger.config.ts`
- `src/core/types.ts` — all interfaces and enums
- `src/core/errors.ts` — custom error types, `AllModelsFailed`, escalation helpers
- `src/core/context.ts` — execution context builder (reads soul.md, loads memory)

### Phase 2: AI Provider Layer
- `src/config/providers.ts` — `createProviderRegistry` with Anthropic/OpenAI/Google
- `src/config/models.ts` — per-agent model mapping & fallback chains
- `src/providers/model-router.ts` — resolve model IDs, dynamic selection by complexity

### Phase 3: Agent Logic
- `src/agents/base-agent.ts` — abstract class with model fallback loop + `generateText`
- `src/agents/grounding-agent.ts` — reads soul.md, returns brand identity + guardrails
- `src/agents/cognition-agent.ts` — decomposes user request into subtask plan
- `src/agents/agency-agent.ts` — executes individual subtasks with tools
- `src/agents/interface-agent.ts` — formats output for delivery
- `src/tools/knowledge-tools.ts` — AI SDK `tool()` for soul.md, brand guidelines

### Phase 4: Trigger.dev Pipeline
- `src/trigger/orchestrate.ts` — top-level pipeline task (sequential guardrail stages)
- `src/trigger/ground.ts` — wraps grounding agent in trigger.dev task
- `src/trigger/think.ts` — wraps cognition agent in trigger.dev task
- `src/trigger/execute.ts` — wraps agency agent, uses `batch.triggerByTaskAndWait()` for parallel sub-agents
- `src/trigger/deliver.ts` — wraps interface agent, triggers notification task
- `src/trigger/notify.ts` — notification routing task

### Phase 5: Sub-Agent System
- `src/trigger/sub-agents/registry.ts` — plugin registry
- `src/trigger/sub-agents/base-sub-agent.ts` — base class (Zod schemas, trigger.dev task wrapper)
- `src/trigger/sub-agents/plugins/cohort-monitor.ts` — sample plugin

### Phase 6: Notifications & Integration
- `src/channels/` — Slack + Email adapters
- `src/tools/mcp-client.ts` — MCP server connection
- Human-in-the-loop: `wait.forToken()` in trigger tasks + API endpoint to complete tokens

### Phase 7: API Server, Memory & Testing
- `src/index.ts` — Hono API server (POST /message triggers orchestrate task, GET /status streams via Realtime API)
- `soul.md` — sample brand identity document
- `src/memory/short-term.ts` + `long-term.ts`
- Unit tests (model router, sub-agent registry, agent logic)
- Integration test: trigger full pipeline via API

---

## Verification

1. **Local trigger.dev dev**: `npx trigger.dev@latest dev` — runs tasks locally with full dashboard
2. **Unit tests** (`npx vitest run`): model router, sub-agent registry, agent logic (mocked models)
3. **Pipeline test**: POST to `/message` with "Escalate to human if core cohort shrinks by 5%" — verify all 4 guardrail stages execute in order on trigger.dev dashboard
4. **Parallel test**: Cognition returns 3 independent subtasks → verify Agency stage runs them concurrently in trigger.dev dashboard
5. **Fallback test**: invalid primary API key → verify agent falls back to secondary model (visible in task logs)
6. **Escalation test**: all models fail → verify human-in-the-loop token created, notification sent to marketer + admin
7. **Real-time test**: Subscribe to Realtime API from frontend, verify live status updates as pipeline progresses
