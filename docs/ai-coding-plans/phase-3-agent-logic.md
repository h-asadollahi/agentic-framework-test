# Phase 3: Agent Logic

## What was built

This phase creates the core intelligence layer: the `BaseAgent` abstract class with model fallback, and all four guardrail agents that form the sequential pipeline.

### Files created

| File | Purpose |
|------|---------|
| `src/agents/base-agent.ts` | Abstract base class with model fallback loop and structured logging |
| `src/agents/grounding-agent.ts` | Reads soul.md and guardrails; establishes brand context |
| `src/agents/cognition-agent.ts` | Decomposes user requests into executable subtask plans |
| `src/agents/agency-agent.ts` | Analyzes sub-agent results and aggregates them |
| `src/agents/interface-agent.ts` | Formats responses in brand voice and decides on notifications |
| `src/tools/knowledge-tools.ts` | AI SDK `tool()` wrappers for reading soul.md, guardrails, brand guidelines |

### BaseAgent Pattern

Every agent extends `BaseAgent` which provides the **model fallback loop** — the core reliability mechanism:

```
execute("user message", context)
  │
  ├── Try preferred model (e.g., Anthropic Haiku)
  │   ├── Success → return AgentResult
  │   └── Failure → log warning, continue
  │
  ├── Try fallback 1 (e.g., OpenAI GPT-4o-mini)
  │   ├── Success → return AgentResult
  │   └── Failure → log warning, continue
  │
  ├── Try fallback 2 (e.g., Google Flash)
  │   ├── Success → return AgentResult
  │   └── Failure → log warning, continue
  │
  └── All failed → throw AllModelsFailedError
      (triggers human-in-the-loop escalation)
```

Subclasses only implement two methods:
- `getTools(context)` — return the AI SDK tools this agent can use
- `buildSystemPrompt(context)` — construct the system prompt from execution context

### Guardrail Pipeline Agents

Each agent has a specific role and receives the output of the previous stage:

**1. Grounding Agent** (`grounding-agent.ts`)
- Uses `knowledgeTools` to read soul.md, guardrails.md, brand-guidelines.md
- Returns structured `GroundingResult` (brand identity + constraints)
- Fast model (Haiku) — simple retrieval task

**2. Cognition Agent** (`cognition-agent.ts`)
- Pure reasoning agent — no tools
- Takes user message + grounding output, produces a `CognitionResult` (subtask plan)
- Each subtask has: agentId, description, input, dependencies[], priority
- Balanced model (Sonnet) — planning needs good reasoning

**3. Agency Agent** (`agency-agent.ts`)
- Analyzes results from sub-agent executions
- Aggregates into coherent `AgencyResult` with summary and issues
- Actual sub-agent triggering happens at the trigger.dev task level (Phase 4)

**4. Interface Agent** (`interface-agent.ts`)
- Applies brand voice rules to format the final response
- Determines which notifications to send (channel, recipient, priority)
- Returns `DeliveryResult` (formatted response + notification list)

### AI SDK v6 Compatibility Notes

- **`Tool` type** (not `CoreTool`): AI SDK v6 renamed this export
- **`LanguageModel` type** (not `LanguageModelV1`): Same rename
- **`inputSchema`** (not `parameters`): `tool()` function now uses `inputSchema` property
- **`generateText`**: Works the same; we spread tools conditionally (only when agent has tools)

### What's next

Phase 4 will wire these agents into trigger.dev tasks, creating the durable orchestration pipeline with parallel sub-agent execution.
