# Codex Plan 82

Status: Implemented (2026-03-16)

## Goal
Fix the deterministic deliver output for the Mapp dimensions/metrics catalog prompt so marketer-facing responses include counts plus readable grouped samples instead of a generic success summary.

## Root Cause
- `route-002` correctly executes `mcp-fetcher` with `toolName: "list_dimensions_and_metrics"`.
- `mcp-fetcher` returns a structured compacted payload with `dimensionsCount`, `metricsCount`, `dimensions[]`, and `metrics[]`.
- `pipeline-deliver` deterministic fast path currently renders only `agencyResult.summary` plus extracted text-like `criticalFacts`.
- The catalog payload is serialized JSON, so the fast path does not expose the counts or name lists in marketer output.

## Changes
1. Add deterministic structured-output parsing in the deliver layer for serialized MCP tool results.
2. Add a route/tool-specific fast-path renderer for `list_dimensions_and_metrics` that shows:
   - total dimensions count
   - total metrics count
   - readable grouped samples from both lists
3. Keep the existing generic deterministic fast path as the fallback for all other deterministic routes.
4. Add regression tests covering the catalog renderer and ensuring this prompt class no longer falls back to `Results were retrieved successfully.`
5. Update `docs/HANDOVER.md` and `docs/usage-guide.md` to record the behavior change and future expectations.

## Acceptance Criteria
- `List all available dimensions and metrics in Mapp Intelligence` produces marketer output with counts and readable grouped samples.
- The deterministic fast path still works for non-catalog deterministic routes.
- The deliver regression tests pass.
- The handover and usage guide reflect the new behavior.

## Result
- Added structured deterministic-result parsing plus a route-specific fast-path renderer for `list_dimensions_and_metrics`.
- Added deliver regression coverage for the catalog rendering path.
- Updated `docs/HANDOVER.md` and `docs/usage-guide.md`.
- Restored clean typecheck validation by loosening `parseAgentJson()` generic constraints from `Record<string, unknown>` to `object`.
