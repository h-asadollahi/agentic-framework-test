# Codex Memory (Project Snapshot)

Last updated: 2026-03-17

## Collaboration Rules to Follow

1. Before implementation, provide a plan and save it in `docs/ai-coding-plans/` with numbered naming:
- `docs/ai-coding-plans/codex-plan-01.md`, `docs/ai-coding-plans/codex-plan-02.md`, ...

2. After each implementation batch:
- Commit changes immediately after the batch is complete.
- Push to `main` immediately after the commit.
- Treat this as a strict standing rule from the user, not an optional follow-up step.

3. Keep `docs/HANDOVER.md` updated continuously:
- Latest status must always be saved there (including when context might reset).

## Current Project Context

- Project: Multi-agent marketing platform (Trigger.dev + Vercel AI SDK + TypeScript + Hono)
- Slack thread-read + polling path is verified working.
- Learned routes support both API targets and sub-agent targets.

## Recent Completed Batch (reference)

- Pipeline failure escalation wiring in orchestrator.
- Deterministic unknown-subtask routing strategy helper.
- Additional non-Slack unit tests for routing/parser/store.
- Plan and handover docs updated.
