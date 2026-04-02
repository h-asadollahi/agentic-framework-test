# Plan 117 — Token Usage: move 5 summary cards into a stats popover

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-02
**Scope:** Same pattern as plan-112 (Audit Trail). Remove the 5 summary-grid cards; replace `#tokenUsageCountPill` with a clickable trigger button; move the 5 stat IDs into a body-level popover. Reuses all existing audit stats CSS — no new CSS. No backend changes.

## Files changed
- `admin/public/index.html` — replace pill with trigger button; remove summary-grid section; add body-level popover
- `admin/public/app.js` — add `positionTokenUsageStatsPopover()`, toggle listener, extend outside-click handler

## How to test
1. Token Usage page — 5 summary cards gone
2. Top-right shows "📊 9 prompt runs ∨" button
3. Click it → popover shows Today Input, Today Output, Total Tokens, Prompt Runs, LLM Calls
4. Click outside → closes
5. Filters refresh → pill text + popover values update correctly
