# Cognition Agent Decision Logic

This document mirrors Cognition stage behavior in a human-readable form.

## Runtime-Authoritative Files

- `src/trigger/think.ts`
- `src/trigger/cognition-guardrails.ts`
- `src/trigger/execute.ts`
- `src/trigger/route-target-resolution.ts`
- `src/routing/skill-candidates-store.ts`

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

Execution applies a deterministic safety net:

- If a matched learned route targets `routeType: "sub-agent"`, the execution stage uses that route target agent (for example `mcp-fetcher`) even when Cognition emits a different registered agent.
- If a matched learned route targets `routeType: "api"`, execution routes to `api-fetcher`.
- This keeps learned-route targets as source-of-truth and prevents MCP routes from being executed via API fallback agents.
- Tie-break priority prefers MCP sub-agent routes over API routes for overlapping matches, preserving MCP-first behavior.
- Intelligence report-template routes (analysis-query/report-query backed by `ref/*.json`) are routed to `api-fetcher` when their patterns match.

## Skill Feedback Loop

- Agency may emit structured `skillSuggestions` in its JSON result.
- `pipeline-execute` persists valid suggestions to `knowledge/skill-candidates.json`.
- Cognition prompt receives injected candidate summaries and can route automation requests to `agentId: "skill-creator"`.
- Execution handles `skill-creator` deterministically through the universal skill creator workflow.

## Change Guidance

- Update this file whenever cognition fallback/rejection behavior changes.
- Keep this file synchronized with `think.ts` and `cognition-guardrails.ts`.
- Preserve deterministic rejection safeguards to avoid out-of-scope execution.
