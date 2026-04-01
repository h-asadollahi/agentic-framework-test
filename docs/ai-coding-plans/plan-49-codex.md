# Codex Plan 49 — Renumber `learned-routes.json` IDs After Cleanup

## Summary
After manual route cleanup, normalize route IDs in `knowledge/learned-routes.json` to contiguous numbering and update internal route references.

## Steps
1. Renumber route `id` fields sequentially based on current array order:
- `route-001` ... `route-00N`
2. Update internal `agentInputDefaults.routeId` values to the corresponding new IDs.
3. Validate JSON structure and schema compatibility.
4. Update `docs/HANDOVER.md` with this maintenance change.
5. Commit and push only the relevant files.

## Acceptance Criteria
- Route IDs are contiguous with no gaps.
- All embedded `routeId` references remain consistent with their owning route.
- `learned-routes` schema parsing succeeds.
