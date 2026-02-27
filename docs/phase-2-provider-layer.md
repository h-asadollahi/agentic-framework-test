# Phase 2: AI Provider Layer

## What was built

This phase creates the multi-model abstraction layer that allows any agent to call Claude, OpenAI, or Gemini models through a unified interface.

### Files created

| File | Purpose |
|------|---------|
| `src/config/providers.ts` | Unified provider registry via AI SDK's `createProviderRegistry` |
| `src/config/models.ts` | Per-agent model assignment with ordered fallback chains |
| `src/providers/model-router.ts` | Resolves model aliases to `LanguageModel` instances |

### Architecture

```
Agent code calls:  modelRouter.resolve("anthropic:fast")
                          │
                          ▼
              MODEL_ALIASES lookup
        "anthropic:fast" → "anthropic:claude-haiku-4-5-20251001"
                          │
                          ▼
            registry.languageModel(...)
                          │
                          ▼
              Returns LanguageModel instance
              (ready to use with generateText)
```

### Model Tier System

Models are organized into tiers (`fast`, `balanced`, `powerful`/`reasoning`) per provider:

| Tier | Anthropic | OpenAI | Google |
|------|-----------|--------|--------|
| fast | Haiku 4.5 | GPT-4o-mini | Gemini 2.0 Flash |
| balanced | Sonnet 4.5 | GPT-4o | Gemini 2.0 Pro |
| powerful/reasoning | Opus 4 | o3 | — |

### Per-Agent Model Assignment

| Agent | Preferred | Fallback Chain | Why |
|-------|-----------|---------------|-----|
| Orchestrator | Opus (powerful) | GPT-4o → Gemini Pro | Complex coordination needs top reasoning |
| Grounding | Haiku (fast) | GPT-4o-mini → Flash | Simple context loading, speed matters |
| Cognition | Sonnet (balanced) | o3 → Gemini Pro | Planning needs solid reasoning |
| Agency | Sonnet (balanced) | GPT-4o → Gemini Pro | Tool chaining, moderate complexity |
| Interface | Haiku (fast) | GPT-4o-mini → Flash | Formatting/routing, speed matters |

### Key Design Decisions

**Alias system**: Agents reference `"anthropic:fast"` not `"anthropic:claude-haiku-4-5-20251001"`. Upgrading a model is a one-line change in `providers.ts` — no agent code changes needed.

**ModelRouter class**: Provides three access patterns:
1. `resolve(alias)` — direct alias → model instance
2. `getModelsForAgent(agentId)` — returns [preferred, ...fallbacks] for the agent's fallback loop
3. `selectByComplexity(level, provider?)` — dynamic selection when complexity isn't known at config time

**Registry type safety**: AI SDK v6 uses `LanguageModel` (not `LanguageModelV1`). The registry expects template literal types (`anthropic:${string}`), so we cast the resolved alias to `RegistryModelId`.

### What's next

Phase 3 will build the agent logic layer: `BaseAgent` abstract class with model fallback loop, then the four guardrail agents (Grounding, Cognition, Agency, Interface).
