# Plan 115 — Token Usage: Daily / Monthly grouping toggle

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-02
**Scope:** Add a "Group By" filter (Day / Month) to the Token Usage page. Frontend-only label/filter changes + minimal backend pass-through of `groupBy` param to switch `DATE_TRUNC` granularity in the DB query.

---

## Files changed

| File | Change |
|---|---|
| `admin/public/index.html` | Add Group By `<select>` to filter grid; add `id` to "Today" eyebrows + breakdown heading/th |
| `admin/public/app.js` | Add getter; update `renderTokenUsageSummary` labels; pass `groupBy` in `loadTokenUsagePage`; add change listener |
| `src/admin/routes.ts` | Parse `groupBy` query param; pass to `llmUsageStore.getSummary()` |
| `src/observability/llm-usage-store.ts` | Add `groupBy` to `getSummary()` options type |
| `src/routing/learned-routes-db-repository.ts` | Add `groupBy` to options type; switch `promptDailyBucket` SQL expression |

## How to test

1. Open Admin UI → Token Usage
2. Default (Day): breakdown table shows `YYYY-MM-DD` rows — unchanged behaviour
3. Switch "Group By" to "Month": table re-fetches, shows `YYYY-MM` rows (e.g. `2025-04`)
4. "Today" card eyebrows change to "Latest Month"
5. Scope pill shows e.g. `marketer · 30 days · monthly`
6. Switch back to "Day" — all labels revert, daily rows return
7. 90 days + Month → ~3 rows
