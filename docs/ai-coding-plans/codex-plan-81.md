# Codex Plan 81

## Goal
Prevent deterministic MCP-backed formatting/synthesis subtasks from entering `learn-route` and triggering false admin HITL alerts for prompts like `List all available dimensions and metrics in Mapp Intelligence`.

## Root Cause
- Cognition correctly selects the deterministic MCP route (`route-002`) for the original user prompt.
- Cognition may add a second `general` subtask to normalize/present the MCP result.
- In `execute`, unknown/general subtasks currently match learned routes only by description text and ignore `input.routeId`.
- The current synthesis detectors do not recognize phrases like `normalize`, `present`, `grouped`, `de-duplicated`, or `scannable`.
- Those subtasks therefore look data-oriented and are misclassified as `learn-new-route`, which triggers `learn-route` and Slack escalation.

## Changes
1. Extend synthesis detection in the cognition/execute routing helpers to recognize normalization/presentation phrasing commonly used for deterministic result formatting.
2. Harden `execute` unknown-subtask fallback so a `general`/`assistant` subtask with a deterministic `routeId` or deterministic dependency cannot go to `learn-route`.
3. Prefer deterministic formatting fallback or LLM fallback over route learning for those subtasks.
4. Add regression tests for:
   - the dimensions/metrics MCP prompt pattern
   - `general` formatting subtasks carrying `routeId`
   - synthesis wording variants (`normalize`, `grouped`, `de-duplicated`, `scannable`)
5. Update `docs/HANDOVER.md` with:
   - root cause
   - implementation outcome
   - what to verify next
   - where future assistants should continue

## Acceptance Criteria
- The dimensions/metrics prompt stays on the MCP path and does not trigger `learn-route` for formatting-only follow-up work.
- No admin HITL escalation is triggered solely because of deterministic formatting subtasks.
- Existing learned-route behavior for truly new data/integration requests remains intact.
- Tests cover the fixed path and pass.
