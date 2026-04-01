# Repo Guidelines

These guidelines apply to future implementation work in this repository, regardless of which coding assistant or human contributor is doing the work.

## Planning

- Save implementation plans in `docs/ai-coding-plans/` using numbered filenames such as `codex-plan-97.md`.
- Keep plans short, concrete, and scoped to one deliverable.
- When a plan is implemented, update `docs/HANDOVER.md` with the result, important decisions, validation, and next steps.

## Post-Implementation Verification

After finishing an implementation, do not stop at code changes alone.

Always do the following before handoff when feasible:

1. Run the relevant automated validation for the files or flows you changed.
2. Re-test the actual feature or workflow you just implemented, not only unit tests.
3. Report exactly what was tested, what passed, and what was not tested.
4. If a live/manual check could not be executed, say that explicitly.

## Manual Test Steps Per Plan

For every implemented plan, include a short `How to test` section when possible.

That section should be practical and brief:

1. Preconditions
   - what services must be running
   - what env vars or credentials are needed
2. Exact action
   - prompt, endpoint, page, or command to run
3. Expected result
   - what success should look like
4. Failure signals
   - what warning/error to watch for

## Recommended Validation Format

Use this structure in final updates and in `docs/HANDOVER.md` when relevant:

- `Automated validation:` list commands that were run
- `Manual verification:` list user-facing checks that were performed
- `Not tested:` note anything still unverified
- `How to test:` give short reproducible steps for the newly implemented behavior

## Git Hygiene

- Commit only the files related to the implemented change.
- Do not include unrelated local edits unless explicitly requested.
- If the working tree contains user-owned experimental changes, leave them untouched and call them out in the final update.

