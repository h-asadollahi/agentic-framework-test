# Codex Plan 97

## Goal
Add a durable repo guideline for post-implementation verification so future assistants always test what they changed and provide manual test steps per plan.

## Changes
1. Create a repo-level guideline document under `docs/` for coding workflow expectations.
2. Add explicit rules:
   - after implementation, run relevant automated validation before handoff
   - include a short manual test checklist for each implemented plan when possible
   - report what was tested and what was not tested
3. Reference the guideline from the usage guide so future contributors can find it.
4. Record the new workflow rule in `docs/HANDOVER.md`.

## Acceptance criteria
- The repo contains a human-readable guideline doc with the new verification rule.
- Future implementers have a clear pattern for both automated and manual validation.
- Handover reflects the new expectation for any LLM coding assistant.
