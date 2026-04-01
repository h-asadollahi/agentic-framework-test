# Plan 110 — Audit Trail Run List Enrichment + Run Tree Modal

**Assistant:** Codex  
**Date:** 2026-04-01  
**Scope:** Improve the Admin UI Audit Trail so the run list shows more useful metadata, and move the full Run Tree inspection into a popup modal opened by `Inspect`.

## Problem
The current Audit Trail left rail is too compact:
- it mostly shows the pipeline run ID
- useful context like brand, status, audience, and event totals is hidden until selection

Also, the full Run Tree currently lives inline, which makes the main Audit page cramped and less focused.

## Deliverables
1. Make the Audit run list visually larger and more informative.
2. Show per-run metadata directly in the list:
   - brand id
   - status
   - audience
   - event count
3. Change `Inspect` so it opens a popup modal containing the full Run Tree and detail pane.
4. Keep the main Audit page usable and compact after the modal is introduced.
5. Update `docs/HANDOVER.md` with the implemented behavior and verification notes.

## Approach
- Reuse the existing admin modal pattern already used for route inspection.
- Add a dedicated audit modal instead of inventing a new overlay system.
- Refactor audit tree/detail rendering helpers so the same tree renderer can target:
  - the inline audit area
  - the audit modal
- Enrich each run-list row with structured metadata chips/lines while keeping the `Inspect` action obvious.

## Validation
- `node --check admin/public/app.js`
- Manual DOM/markup sanity review
- If feasible, run targeted build or JS checks

## How to test
1. Open the Admin UI and go to `Audit Trail`.
2. Confirm each run row shows:
   - run id
   - brand id
   - status
   - audience
   - event count
3. Click `Inspect` on a run.
4. Confirm a modal opens with the Run Tree on the left and the selected-node detail pane on the right.
5. Close the modal via:
   - close button
   - backdrop click
   - `Esc`
