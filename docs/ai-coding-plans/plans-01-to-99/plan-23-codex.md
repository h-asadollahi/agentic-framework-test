# Codex Plan 23 — Add Test-Derived Prompt Examples to Usage Guide

Date: 2026-03-09
Status: Completed

1. Scan tests for realistic prompt strings
- Review unit tests for prompt-style inputs currently used for routing and guardrail behavior.

2. Update usage guide prompt examples
- Add any missing high-value prompt examples derived from tests.
- Keep examples grouped by behavior (accepted/routed/rejected).

3. Persist
- Update `docs/HANDOVER.md`.
- Mark this plan completed.
- Commit and push to `main`.
