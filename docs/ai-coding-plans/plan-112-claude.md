# Plan 112 — Audit Trail: compact stats popover + run list expansion

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-02
**Scope:** Admin UI only — no backend changes.

---

## Problem

The Audit Trail page opens with a large summary-grid of 6 stat cards (Total Runs, Running Runs, Failed/Rejected, Total Events, Warnings, Errors) that takes up most of the viewport before the user can even see the filters or the run list. The header pill "7 runs · 327 events" already gives the key numbers — the 6-card grid is redundant and wastes space.

Additionally, the run list is too compact — it only shows a status icon, a truncated run ID, and an Inspect button. Users can't tell which run belongs to which brand, when it ran, or what its status is without clicking Inspect first.

Separately, the "Run Tree" panel in the left column is small and cramped. Clicking Inspect should open the tree in a wide modal (reusing the existing `.modal-shell` pattern) rather than squeezing it into a sidebar column.

---

## Changes

### 1. Remove the 6-card summary-grid from the page

Delete `<section class="summary-grid">` containing the 6 audit summary cards. The IDs (`auditTotalRuns`, `auditRunningRuns`, etc.) move into a popover so `renderAuditSummary` in `app.js` keeps working unchanged.

### 2. Replace `#auditStatusPill` with a stats-trigger button

The plain pill becomes a clickable `<button id="auditStatsTrigger">` that shows a chart-bar icon + the summary text (e.g. "7 runs · 327 events"). Clicking it toggles a positioned popover panel below it.

### 3. Stats popover

A `<div id="auditStatsPopover">` absolutely positioned below the trigger. Contains the 6 stat values in a compact 2-column grid. Clicking outside closes it. The same element IDs (`auditTotalRuns`, etc.) live here so no JS logic changes.

### 4. Expand run list items

Each `.audit-run-item` row becomes taller and shows:
- Row 1: status icon + run ID (truncated) + Inspect button
- Row 2: brand · audience · started timestamp (muted, smaller)

CSS: increase `.audit-runs-list` max-height to 280px; item becomes `flex-direction: column`.

### 5. Inspect → open tree modal

- Add `<div id="auditTreeModal" class="modal-shell" hidden>` at the bottom of `<main>` (sibling to `#routeModal`).
- Modal contains: header (run ID + Close button) + a 2-column layout identical to the current workspace (tree on left, detail pane on right) but full-width at `min(1100px, 100%)`.
- The left `.audit-left-tree` and `#auditDetailPanel` are **moved** into the modal; they are removed from the inline workspace.
- The inline workspace now shows only the runs list (full height).
- Clicking Inspect: loads run details → populates modal tree + detail pane → opens modal.
- Close button + backdrop click closes modal.

---

## Files changed

| File | Change |
|---|---|
| `admin/public/index.html` | Remove summary-grid; replace pill with stats trigger+popover; expand run-item layout; restructure audit-workspace to runs-only; add `#auditTreeModal` |
| `admin/public/app.js` | Update `renderAuditRuns` for expanded row; add `openAuditModal` / `closeAuditModal`; update `renderAuditRunDetails` to target modal containers; wire trigger+popover toggle; wire modal close |

---

## How to test

1. Open Admin UI → Audit Trail.
2. The 6-card grid is gone; only header + filters + runs list + workspace are visible.
3. Click the "📊 7 runs · 327 events" button → popover shows the 6 stats; click outside → closes.
4. Run list rows now show brand, audience, and start time below the run ID.
5. Click **Inspect ▶** on a run → wide modal opens with tree on left and detail pane on right.
6. Click a node in the tree → detail pane updates inside the modal.
7. Click Close or the backdrop → modal closes.
8. Refresh → summary counts still update correctly via `renderAuditSummary`.
