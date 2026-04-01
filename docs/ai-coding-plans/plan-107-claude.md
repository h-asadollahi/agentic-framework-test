# Plan 107 — Audit Trail: Trigger.dev-style tree + details pane

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-01
**Scope:** Redesign the Admin UI Audit Trail page to use a Trigger.dev-style left-panel tree (parent/child hierarchy of phases → components → events) with a right-panel detail pane. Remove the flat timeline view. No backend changes.

---

## Problem

The current audit trail shows a flat timeline grouped by phase. It doesn't communicate the parent/child structure (pipeline → phase → component → event) and there's no focused detail pane — inspecting a single event requires reading a wall of JSON.

---

## Target layout

```
[Summary cards row]
[Filters row]

┌──────────────────────────────────────────────────────────────────┐
│ Runs list (compact, left 320px)  │ Detail pane (right, flexible)  │
│ ──────────────────────────────── │ ──────────────────────────────  │
│ • run-abc [✓] 2m 42s  Inspect ▶  │  [Selected node info]          │
│   run-xyz [✗] 0.4s    Inspect ▶  │  Type / timing / status        │
│                                  │  Input / Output payload         │
├──────────────────────────────────│  (collapsible JSON tree)        │
│ Tree for selected run:           │                                  │
│ ▼ 🔵 orchestrate-pipeline [✓]   │                                  │
│   ▼ 🟣 grounding           [✓]  │                                  │
│     ▼ 🤖 agent/grounding   [✓]  │                                  │
│         ℹ model-start           │                                  │
│         ✓ model-complete        │                                  │
│         ⚠ parse-warning         │                                  │
│   ▼ 🟣 cognition           [✓]  │                                  │
│     ...                         │                                  │
└──────────────────────────────────┴──────────────────────────────────┘
```

---

## Tree node types

Built from `AgentAuditEventRecord[]`:

| Level | Source | Icon | Expanded info |
|---|---|---|---|
| **Run** | `AgentAuditRunRecord` | 🔵 pipeline icon | prompt, session, brand, timing, totals |
| **Phase** | group by `event.phase` | 🟣 phase icon | phase name, event count, warnings, errors |
| **Component** | group by `componentKind/componentId` within phase | 🤖 / ⚡ | model, provider, tokens, duration |
| **Event** | individual `AgentAuditEventRecord` | ℹ / ✓ / ⚠ / ✗ | eventType, sequence, durationMs, full payload |

Status icons:
- ✓ green — completed / success
- ✗ red — failed
- ⚠ yellow — warning status event
- ℹ blue — info / neutral
- ⟳ animated — running

---

## Detail pane content per node type

**Run node**: `userPrompt`, `sessionId`, `brandId`, `audience`, `scope`, `source`, `status`, `startedAt → finishedAt`, total events/warnings/errors

**Phase node**: phase label, event count, first/last timestamp, warning list

**Component node**: `componentKind`, `componentId`, `modelAlias`, `resolvedModelId`, `provider`, `durationMs`, `tokensUsed`, `status`

**Event node**: `eventType`, `sequence`, `status`, `durationMs`, `tokensUsed`, then full `payload` rendered as collapsible JSON tree (same component already used in the chat trace view)

---

## Files changed

| File | Change |
|---|---|
| `admin/public/index.html` | Replace `auditPage` interior with 2-column layout (runs list + tree left, detail pane right) |
| `admin/public/app.js` | Replace `renderAuditRunDetails` (timeline) with `buildAuditTree` + `renderAuditTree` + `renderAuditNodeDetail` |

---

## How to test

1. Open Admin UI → Audit Trail.
2. Expect: summary cards + filters intact; below = compact runs list on left.
3. Click **Inspect** on a run → tree expands below the run list showing phases.
4. Click a **phase node** → right pane shows phase summary (event count, timing).
5. Click a **component node** → right pane shows model, provider, tokens, duration.
6. Click an **event node** → right pane shows eventType, sequence, and collapsible payload JSON.
7. Expand/collapse any node — children hide/show cleanly.
8. Select a different run from the list → tree resets to the new run.
9. Warning events should show ⚠ yellow; failed events ✗ red; info events ℹ blue.
