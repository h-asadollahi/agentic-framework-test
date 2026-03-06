# Codex Memory (Project Snapshot)

Last updated: 2026-03-06

## Collaboration Rules to Follow

1. Before implementation, provide a plan and save it in `docs/` with numbered naming:
- `codex-plan-01.md`, `codex-plan-02.md`, ...

2. After each implementation batch:
- Commit changes.
- Push to `main`.

3. Keep `docs/HANDOVER.md` updated continuously:
- Latest status must always be saved there (including when context might reset).

## Current Project Context

- Project: Multi-agent marketing platform (Trigger.dev + Vercel AI SDK + TypeScript + Hono)
- Slack thread-read scope (`channels:history`) is not yet approved.
- Slack-dependent end-to-end tests remain blocked until scope approval.

## Recent Completed Batch (reference)

- Pipeline failure escalation wiring in orchestrator.
- Deterministic unknown-subtask routing strategy helper.
- Additional non-Slack unit tests for routing/parser/store.
- Plan and handover docs updated.
