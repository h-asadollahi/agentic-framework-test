# Codex Plan 88

Status: Implemented (2026-03-17)

## Goal
Move Activity Feed and Run Watch into their own admin pages, matching the dedicated-page approach already used for Learned Routes.

## Root Cause
- The dashboard still carries both the activity feed and run watch sections inline.
- Those operational views are valuable enough to stand on their own instead of competing with the overview page.
- The user wants the same dedicated-page treatment applied consistently across these admin areas.

## Changes
1. Move the activity feed into a dedicated admin page.
2. Move the run watch summary into a dedicated admin page.
3. Update sidebar navigation and hash routing to support the new pages while keeping old section hashes compatible.
4. Update admin docs, usage guide, and handover with the new admin shell structure.

## Acceptance Criteria
- The dashboard no longer renders the activity feed or run watch sections inline.
- Sidebar navigation opens dedicated pages for Activity Feed and Run Watch.
- Existing event and run summary data loading still works.

## Result
- Moved Activity Feed into its own admin page.
- Moved Run Watch into its own admin page.
- Updated hash routing and sidebar navigation so those pages behave consistently with Learned Routes.
- Kept the existing `events`, `eventsCount`, `runs`, and `runsCount` bindings intact.
