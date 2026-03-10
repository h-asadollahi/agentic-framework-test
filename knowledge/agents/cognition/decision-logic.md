# Cognition Agent Decision Logic

This document mirrors Cognition stage behavior in a human-readable form.

## Runtime-Authoritative Files

- `src/trigger/think.ts`
- `src/trigger/cognition-guardrails.ts`

## Execution Flow

1. Build Cognition input from:
   - user message
   - grounding brand identity
   - grounding guardrails
2. Execute Cognition agent and parse JSON output.
3. If output is not valid JSON:
   - create a default single subtask:
     - `agentId: "general"`
     - `description: <user message>`
   - set reasoning to parser fallback message.
4. Apply deterministic guardrail rejection policy.
5. If `rejected === true`:
   - normalize to canonical rejected payload
   - stop pipeline in orchestrator after cognition stage.

## Deterministic Rejection Policy

Cognition rejects requests that are outside marketer scope, including:

- Competitor/rival-focused requests.
- Non-marketing requests (for example: weather, recipes, sports, politics).

The canonical rejection payload includes:

- `subtasks: []`
- `rejected: true`
- user-facing `rejectionReason`

## Learned Route Guidance

Prompt-level route hints are injected dynamically from `knowledge/learned-routes.json`
through `src/agents/cognition-agent.ts` (`buildLearnedRoutesSection`).

## Change Guidance

- Update this file whenever cognition fallback/rejection behavior changes.
- Keep this file synchronized with `think.ts` and `cognition-guardrails.ts`.
- Preserve deterministic rejection safeguards to avoid out-of-scope execution.
