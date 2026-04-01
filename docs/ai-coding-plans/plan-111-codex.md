# Plan 111 — Audit Trail Table View + Modal Tree Inspector

**Assistant:** Codex  
**Date:** 2026-04-01  
**Scope:** Refactor the Admin UI Audit Trail so it matches the Learned Routes interaction model: show a full run list/table on the page, and open the Run Tree inside a popup modal.

## Problem
The current Audit Trail uses a left-rail workspace with inline tree/detail rendering. That is denser than needed and does not match the clearer list-plus-popup interaction already used by `Learned Routes`.

## Deliverables
1. Replace the inline Audit workspace with a table/list of audit runs.
2. Show more useful run metadata in the table:
   - run id
   - brand id
   - status
   - audience
   - scope
   - source
   - event count
   - warnings
   - errors
   - started/finished
3. Keep `Inspect` as the primary action.
4. Open a popup modal containing the Run Tree and detail pane.
5. Update `docs/HANDOVER.md` with the corrected UI behavior.

## Validation
- `node --check admin/public/app.js`
- `npm run build`

## How to test
1. Open Admin UI → `Audit Trail`
2. Confirm the page shows a full run table, not the old left-rail tree workspace
3. Click `Inspect` on a run
4. Confirm a modal opens with:
   - Run Tree on the left
   - node detail pane on the right
5. Confirm close behavior works via button, backdrop, and `Esc`
