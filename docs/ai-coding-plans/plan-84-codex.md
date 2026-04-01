# Codex Plan 84

Status: Implemented (2026-03-17)

## Goal
Redesign the separate admin UI into an admin-oriented dashboard shell with a sidebar, soft Mapp-like visual treatment, and clear extension points for future features.

## Root Cause
- The current admin UI is functionally useful but still reads like a stack of raw utility panels.
- It does not yet feel like a dedicated admin workspace that can grow feature-by-feature.
- The user wants a side-panel-driven admin layout and a softer beige/lavender theme similar to the provided inspiration.

## Changes
1. Rebuild `admin/public/index.html` into a dashboard shell with:
   - a left admin sidebar
   - a hero/header area
   - quick action cards
   - a main operations workspace for routes, details, events, and runs
2. Preserve the existing functional DOM hooks (`apiBase`, `loadAll`, `search`, `importBtn`, `exportBtn`, `routesTable`, etc.) so existing admin operations keep working.
3. Upgrade the event and run panels from raw JSON blocks into more admin-friendly list/summary views.
4. Keep the new layout modular so future admin features can be added section by section.
5. Update admin docs, usage guide, and handover to document the new admin shell.

## Acceptance Criteria
- The admin UI has a clear sidebar/dashboard structure.
- The visual theme aligns with the provided soft beige/lavender admin inspiration.
- Existing route loading, filtering, detail inspection, backfill, export, and run/event visibility continue to work.
- The new layout is easier to extend with future admin sections.

## Result
- Rebuilt the admin UI into a sidebar-based dashboard shell with a hero area, summary cards, route explorer, inspection panel, activity feed, and run watch section.
- Preserved the existing admin operations and DOM hooks while improving the presentation layer.
- Upgraded the events and run summary areas from raw JSON blocks into admin-friendly cards and status summaries.
- Updated admin docs, usage guide, and handover to describe the new shell.
