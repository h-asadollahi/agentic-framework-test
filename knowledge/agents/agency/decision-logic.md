# Agency Agent Decision Logic

This document mirrors Agency-stage behavior in a human-readable form.

## Runtime-Authoritative Files

- `src/trigger/execute.ts`
- `src/trigger/execute-routing.ts`

## Execution Flow

1. Receive Cognition subtasks.
2. Group subtasks topologically by dependency levels.
3. Execute same-level subtasks in parallel.

For each subtask:

- If `agentId` is a registered sub-agent:
  - execute via registry, with learned-route input hydration when applicable.
- If `agentId` is unknown:
  - check learned routes
  - if matched, dispatch to learned route target (`sub-agent:*` or `api-fetcher`)
  - if unmatched and skill-intent detected, use:
    - universal skill creator workflow, or
    - MCP builder workflow
  - otherwise decide between route learning and LLM fallback.

## Summary and Fallback

After execution:

1. Agency LLM summarizes subtask outputs into `summary`, `issues`, `needsHumanReview`, and optional `skillSuggestions`.
2. If summary output is not valid JSON, runtime falls back to:
   - direct `results`
   - raw summary text as `summary`
3. Structured `skillSuggestions` are validated and persisted to `knowledge/skill-candidates.json` for future cognition prompts.

## Why This Exists

- Keeps execution decisioning understandable and auditable.
- Separates human-readable policy from code implementation.
- Supports safe future migration of additional decision rules.

## Change Guidance

- Update this file when Agency orchestration or fallback behavior changes.
- Keep it aligned with `execute.ts` and `execute-routing.ts`.
- Preserve deterministic fallback behavior to avoid pipeline interruption.
