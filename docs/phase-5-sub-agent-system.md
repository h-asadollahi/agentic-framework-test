# Phase 5: Sub-Agent System

## What was built

This phase implements the plugin-based sub-agent system — a registry where domain-specific agents register themselves, and the Agency stage discovers and executes them in parallel.

### Files created / modified

| File | Purpose |
|------|---------|
| `src/trigger/sub-agents/registry.ts` | Central plugin registry — register, lookup, validate, execute |
| `src/trigger/sub-agents/base-sub-agent.ts` | Abstract base class for domain sub-agents with model fallback |
| `src/trigger/sub-agents/plugins/cohort-monitor.ts` | Sample plugin — cohort metric analysis |
| `src/trigger/sub-agents/plugins/index.ts` | Barrel file that auto-registers all plugins on import |
| `src/trigger/execute.ts` | **Updated** — wires registry into the Agency stage with parallel execution |

---

## Architecture

### Plugin Registry

The `SubAgentRegistryImpl` is a singleton that holds all registered sub-agent plugins:

```
subAgentRegistry
  ├── register(plugin)       → add a plugin
  ├── unregister(id)         → remove a plugin
  ├── get(id) / getOrThrow() → lookup by ID
  ├── findByCapability(cap)  → lookup by capability tag
  ├── execute(id, input, ctx)→ validate input + run
  └── getSummary()           → metadata for the Cognition agent
```

**Key features:**
- **Input validation**: Uses Zod schemas defined by each plugin to validate inputs before execution
- **Capability discovery**: The Cognition agent can query `getSummary()` to understand what sub-agents are available when planning subtasks
- **Execution tracking**: Wraps each call with timing and structured logging

### BaseSubAgent

Abstract class that every domain plugin extends. Provides the same model-fallback pattern as the guardrail agents:

```typescript
class CohortMonitorAgent extends BaseSubAgent {
  id = "cohort-monitor";
  capabilities = ["cohort-analysis", "retention-analysis", ...];
  inputSchema = CohortMonitorInput;   // Zod schema
  outputSchema = CohortMonitorOutput; // Zod schema

  getSystemPrompt(context) { ... }    // Brand-aware prompt
  getTools(context) { ... }           // AI SDK tools
}
```

The `execute()` method (inherited from BaseSubAgent):
1. Tries the preferred model
2. If it fails, tries each fallback in order
3. Returns `AgentResult` with `{ success, output, modelUsed, tokensUsed, steps }`

### Parallel Execution in the Agency Stage

The updated `execute.ts` now:

1. **Groups subtasks by dependency level** — topological sort ensures independent tasks run together
2. **Runs each level in parallel** via `Promise.allSettled()`:
   - Registered sub-agents → `subAgentRegistry.execute(agentId, input, context)`
   - Unknown agent IDs → fallback to the Agency LLM agent
3. **Aggregates results** and passes them to the Agency agent for summarisation

```
Subtasks from Cognition
       │
       ▼
┌─ Level 0 (no deps) ──────────────────────┐
│  Task A (cohort-monitor) ─→ registry      │  parallel
│  Task B (unknown-agent)  ─→ LLM fallback  │
└───────────────────────────────────────────┘
       │
       ▼
┌─ Level 1 (depends on A/B) ───────────────┐
│  Task C (cohort-monitor) ─→ registry      │  parallel
└───────────────────────────────────────────┘
       │
       ▼
Agency LLM summarises all results → AgencyResult
```

---

## Sample Plugin: Cohort Monitor

The `CohortMonitorAgent` demonstrates the plugin contract:

- **Capabilities**: cohort-analysis, engagement-tracking, retention-analysis, churn-detection, ltv-estimation
- **Input**: `{ cohortId?, metric, timeRange, compareBaseline }`
- **Output**: `{ cohortId, metric, currentValue, baselineValue, percentChange, trend, insight, recommendation, alertLevel }`
- **Tools**: `getCohortMetrics`, `getBaselineMetrics` (simulated data for now)
- **Model**: `anthropic:fast` → `openai:fast` → `google:fast` (low temperature for precise analysis)

The agent auto-registers itself when imported — the barrel file (`plugins/index.ts`) handles this.

---

## How to create a new sub-agent plugin

1. Create a new file in `src/trigger/sub-agents/plugins/`:

```typescript
import { z } from "zod";
import { BaseSubAgent } from "../base-sub-agent.js";
import type { ExecutionContext } from "../../../core/types.js";

const MyInput = z.object({ /* ... */ });
const MyOutput = z.object({ /* ... */ });

export class MyAgent extends BaseSubAgent {
  id = "my-agent";
  name = "My Agent";
  description = "What this agent does";
  version = "1.0.0";
  capabilities = ["my-capability"];
  inputSchema = MyInput;
  outputSchema = MyOutput;

  constructor() {
    super("anthropic:balanced", ["openai:balanced"], 10, 0.2);
  }

  getSystemPrompt(context: ExecutionContext): string { /* ... */ }
  getTools(context: ExecutionContext) { /* ... */ }
}

// Auto-register
import { subAgentRegistry } from "../registry.js";
subAgentRegistry.register(new MyAgent());
```

2. Add the import to `plugins/index.ts`:
```typescript
import "./my-agent.js";
```

3. The Cognition agent can now assign subtasks with `agentId: "my-agent"`, and the Agency stage will route them through the registry.

---

## What's next

Phase 6 will implement:
- Notification channel adapters (Slack, Email, Webhook)
- MCP client integration
- Human-in-the-loop escalation via `wait.forToken()`
