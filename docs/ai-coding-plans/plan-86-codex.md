# Codex Plan 86

Status: Implemented (2026-03-17)

## Goal
Make the admin dashboard hero more compact by removing the persistent descriptive copy and moving server details behind a click-to-open info control.

## Root Cause
- The top admin hero was too tall and visually busy for an operator landing area.
- It always displayed the full API base URL, auth state, and workspace status even though those are only occasionally needed.
- The user wants a tighter header with an info icon for server details on demand.

## Changes
1. Remove the long hero description text from the admin dashboard header.
2. Replace the always-visible server toolbar with an `i` info control that opens a compact server details panel.
3. Keep the existing `apiBase`, `authState`, and `status` DOM hooks intact so admin behavior remains unchanged.
4. Update admin docs, usage guide, and handover to reflect the compact header pattern.

## Acceptance Criteria
- The admin hero is visibly shorter and cleaner.
- API base URL, server auth, and workspace status are hidden by default.
- Clicking the info control reveals those details without breaking current admin behavior.

## Result
- The admin header now shows only the title, an info button, and the refresh action.
- Server details moved into a click-to-open popover while preserving the same DOM bindings.
- The dashboard hero is more compact and better aligned with a future admin control-center workflow.
