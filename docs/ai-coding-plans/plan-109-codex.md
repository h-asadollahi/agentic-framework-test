# Plan 109 — Tighten Repo Guideline for Assistant-Scoped Commits

**Assistant:** Codex  
**Date:** 2026-04-01  
**Scope:** Persist the latest collaboration rule that each coding assistant must commit and push only its own changes unless explicitly instructed otherwise.

## Problem
The repo guidelines already say to avoid unrelated local edits, but the rule should be stricter and explicit for multi-assistant collaboration:
- do not bundle another assistant's changes
- do not bundle the user's manual edits
- do not push mixed work unless the user explicitly asks for it

## Deliverables
1. Update `docs/repo-guidelines.md` with an explicit assistant-scoped commit rule.
2. Record the update in `docs/HANDOVER.md`.
3. Commit and push only those documentation changes.

## Validation
- Review the updated guideline wording in `docs/repo-guidelines.md`
- Confirm the change is reflected in `docs/HANDOVER.md`

## How to test
1. Open `docs/repo-guidelines.md`
2. Go to `Git Hygiene`
3. Confirm it explicitly says each assistant should commit and push only its own changes unless the user says otherwise
