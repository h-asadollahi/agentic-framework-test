# Plan 105 — Human-Readable Audit Payload Inspector in Admin UI

**Assistant:** Codex  
**Date:** 2026-04-01  
**Scope:** Replace the ugly raw JSON-first audit payload rendering with a structured, readable inspector while preserving raw JSON as a fallback.

## Problem
The Admin UI audit timeline currently renders `event.payload` almost entirely as a raw `<pre>` JSON block. This makes prompt snapshots, system prompts, tool-call payloads, and long text previews hard to inspect.

## Deliverables
1. Structured payload inspector for audit events in `admin/public/app.js`
2. Supporting UI styles in `admin/public/index.html`
3. Raw JSON kept as a secondary collapsible fallback
4. Handover update documenting the new inspection behavior

## Approach
- Render payloads by type instead of dumping JSON directly.
- Treat long/multiline strings as readable text blocks with preserved line breaks.
- Render objects as labeled field groups.
- Render arrays as chips/lists when possible, nested structures otherwise.
- Add specific handling for audit payload shapes like `{ type: "text-preview", preview, truncated, originalLength }`.
- Keep `Raw JSON` available for exact debugging/copying.

## Validation
- `node --check admin/public/app.js`
- `npm run build`
- Manual browser verification recommended on the Audit page

## How to test
1. Open the Admin UI Audit page.
2. Load any run with `prompt_snapshot` and `result` events.
3. Confirm payloads render as readable sections instead of a single raw JSON blob.
4. Confirm long prompts/system prompts preserve line breaks and are expandable.
5. Confirm `Raw JSON` is still available below the structured view.
