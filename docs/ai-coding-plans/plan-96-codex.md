# Codex Plan 96

## Goal
Fix the `agent_audit_events.sequence` overflow that breaks audit inserts during live pipeline runs.

## Root cause
- The runtime generates sequence values with `Date.now() * 1000 + counter`.
- That produces values around `1.7e15`.
- The DB column was created as `INTEGER`, which only supports up to `2147483647`.
- Result: audit event writes fail at runtime even though the rest of the pipeline continues.

## Changes
1. Widen `agent_audit_events.sequence` from `INTEGER` to `BIGINT` in the schema.
2. Add an automatic `ALTER TABLE ... ALTER COLUMN sequence TYPE BIGINT` in repository init so existing local DBs self-heal.
3. Keep the current sequence generation logic unchanged.
4. Validate with build and focused audit/admin tests.

## Acceptance criteria
- No runtime warning for `Agent audit event write failed` caused by integer overflow.
- Existing DBs upgrade automatically on next startup.
- Audit ordering continues to work.
