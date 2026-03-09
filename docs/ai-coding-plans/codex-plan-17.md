# Codex Plan 17 — Make Assistant Results Human-Readable in Demo UI

Date: 2026-03-09
Status: Completed

1. Inspect demo rendering path
- Review `demo/app.js` response rendering logic.
- Identify where raw JSON is injected into assistant chat bubble.

2. Implement response normalization
- Extract readable text from final result payloads:
  - direct `formattedResponse`
  - JSON string payloads
  - fenced ```json blocks
- Render clean markdown-like text in the assistant bubble.

3. Verify + document
- Validate locally by simulating raw JSON payload shapes.
- Update `docs/HANDOVER.md`.

4. Persist
- Mark plan completed.
- Commit and push to `main`.
