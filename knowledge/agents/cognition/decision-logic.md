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
- `pipeline-execute` persists valid suggestions to `knowledge/skill-candidates.json` and materializes skill files under `./skills/learned` automatically.
- Candidate entries are stored with no skill-HITL requirement (`requiresApproval: false`) for autonomous self-improvement.
- Think stage deterministically checks prompt-vs-candidate triggers:
  - if matched candidate skill file is missing, it prepends a `skill-creator` subtask before other subtasks.
  - if skill file already exists, no extra skill-creation subtask is added.
  - for `general` synthesis/consolidation subtasks, it annotates subtask input with materialized skill metadata (`candidateId`, `suggestedSkillFile`, `useMaterializedSkill: true`) so execution can use learned-skill guidance directly.
- Execution handles `skill-creator` deterministically through the universal skill creator workflow and writes/updates skill files.
- Unknown-agent execution checks `useMaterializedSkill: true` first; when present and file exists under `skills/learned`, execution performs direct LLM fallback with skill guidance and skips route-learning.
- Route-learning eligibility excludes synthesis/consolidation subtasks (for example “consolidate … into a narrative”), preventing long `learn-route` poll loops.

## Change Guidance

- Update this file whenever cognition fallback/rejection behavior changes.
- Keep this file synchronized with `think.ts` and `cognition-guardrails.ts`.
- Preserve deterministic rejection safeguards to avoid out-of-scope execution.
