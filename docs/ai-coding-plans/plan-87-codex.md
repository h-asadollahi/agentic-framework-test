# Codex Plan 87

Status: Implemented (2026-03-17)

## Goal
Move learned routes into their own admin page and replace the inline inspection section with a route-inspection pop-up.

## Root Cause
- The dashboard still mixes route inventory with the main admin overview.
- Learned routes take up a large amount of vertical space on the dashboard even though they now deserve their own workspace.
- The current inline inspection section forces route details to live under the table, which makes the page heavier and less task-focused.

## Changes
1. Split the admin shell into separate dashboard and learned-routes pages using the existing static frontend.
2. Move the route explorer and route filters into the learned-routes page.
3. Replace the inline route inspection section with a pop-up modal opened by the `Inspect` action.
4. Preserve current admin operations and route-detail rendering logic while changing the presentation layer.
5. Update docs, usage guide, and handover with the new navigation and inspection behavior.

## Acceptance Criteria
- Learned routes no longer render on the dashboard page.
- Sidebar navigation can open a dedicated learned-routes page.
- The `Inspect` action opens a pop-up with the selected route details.
- Existing route loading and delete behavior continue to work.

## Result
- Split the admin shell into dashboard and learned-routes pages using hash-based frontend navigation.
- Moved the route explorer off the dashboard and into its own learned-routes page.
- Replaced the inline inspection section with a reusable route-details modal opened by `Inspect`.
- Preserved route loading, selection highlighting, and delete behavior while removing the old inline inspection block.
