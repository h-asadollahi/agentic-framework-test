# Codex Plan 47 — Demo Output Fidelity + Raw JSON Inspector

## Summary
Fix demo UI response fidelity issues (especially malformed/truncated-looking "Detailed Findings") and add an always-available raw JSON inspector with expand/collapse.

## Steps
1. Improve markdown rendering robustness in `demo/app.js`:
- normalize bullet-prefixed markdown table rows (`- | ... |`) into proper table lines
- keep existing heading/list rendering behavior unchanged

2. Add raw JSON inspector in assistant messages:
- append a collapsible `Raw JSON` section for final pipeline output
- if `formattedResponse` itself is JSON/fenced JSON, add a parsed collapsible inspector for it

3. Style the raw inspector in `demo/styles.css` for readability.

4. Validate manually + run project tests to ensure no regressions.

5. Update `docs/HANDOVER.md` with the change summary.

6. Commit and push to `main`.

## Acceptance Criteria
- Detailed Findings in markdown no longer appears truncated due bullet-prefixed table lines.
- Demo UI always provides expandable raw JSON visibility for the final output payload.
- Existing pipeline behavior unchanged.
