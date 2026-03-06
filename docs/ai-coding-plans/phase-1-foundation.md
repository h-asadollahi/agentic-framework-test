# Phase 1: Foundation & Trigger.dev Setup

## What was built

This phase establishes the project skeleton and core type system that every other module depends on.

### Files created

| File | Purpose |
|------|---------|
| `package.json` | Project config: ESM module, scripts for dev/build/test/trigger |
| `tsconfig.json` | TypeScript strict mode, ES2022 target, ESM output |
| `.env.example` | Template for all required environment variables |
| `src/core/types.ts` | All shared interfaces, enums, and type contracts |
| `src/core/errors.ts` | Custom error classes and escalation helpers |
| `src/core/context.ts` | Execution context builder — parses soul.md and guardrails.md |
| `src/core/logger.ts` | Structured JSON logger (trigger.dev captures console output automatically) |
| `soul.md` | Sample brand identity document |
| `knowledge/guardrails.md` | Hard constraints (never-do/always-do rules) |
| `knowledge/brand-guidelines.md` | Communication channels, campaign types, key metrics |

### Key design decisions

**ESM modules (`"type": "module"`)**: All imports use `.js` extensions for Node.js ESM compatibility. This aligns with Vercel AI SDK v6 and trigger.dev SDK v4 which are ESM-first.

**Type system (`src/core/types.ts`)**: This is the single source of truth for all data shapes flowing through the pipeline:

- **`ExecutionContext`** — the "bag of state" passed to every agent: brand identity, guardrails, memory
- **`SubTask`** — produced by Cognition agent, consumed by Agency agent. Has `dependencies[]` for topological ordering
- **`AgentResult`** — uniform return type from every agent, includes `modelUsed` for observability
- **`SubAgentPlugin`** — the interface sub-agents must implement. Uses Zod schemas for input/output validation
- **`PipelinePayload` / `PipelineResult`** — top-level input/output for the orchestrator task
- **Phase-specific result types** (`GroundingResult`, `CognitionResult`, `AgencyResult`, `DeliveryResult`) — typed contracts between pipeline stages

**Context builder (`src/core/context.ts`)**: Parses `soul.md` by convention (H1 = brand name, H2 = sections, H3 = sub-sections, bullet lists = items). This keeps brand identity as a simple markdown file that non-technical team members can edit.

**Error hierarchy (`src/core/errors.ts`)**:
- `AllModelsFailedError` — triggers human-in-the-loop escalation
- `SubAgentNotFoundError` / `SubAgentValidationError` — sub-agent registry errors
- `GuardrailViolationError` — hard constraint breaches
- `buildEscalation()` — helper to construct `HumanEscalation` payloads

### Dependencies installed

**Production**: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mcp`, `@modelcontextprotocol/sdk`, `@trigger.dev/sdk`, `zod`, `@slack/web-api`, `@sendgrid/mail`, `dotenv`, `hono`

**Dev**: `typescript`, `tsx`, `vitest`, `@types/node`

### What's next

Phase 2 will build the AI provider layer: `createProviderRegistry` with Anthropic/OpenAI/Google, per-agent model mapping, and the model router with dynamic selection.
