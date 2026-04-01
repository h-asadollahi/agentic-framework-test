# codex-plan-66

1. Restore `knowledge/learned-routes.json` from the latest full committed version (`949833b`) to recover all routes.
2. Verify route count and key MCP routes (`page impressions`, `list segments`, `dimensions/metrics`) are present.
3. Backfill restored JSON routes into DB so DB-backed runtime uses the same restored route set.
4. Update `docs/HANDOVER.md` with the restoration details.
