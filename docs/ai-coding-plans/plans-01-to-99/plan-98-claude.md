# Claude Plan 98: Migrate Skill Candidate Metadata to PostgreSQL

## Context

Skill candidates are currently stored as a flat JSON file (`knowledge/skill-candidates.json`). As the learned-skills library grows, this causes linear-scan discovery, no per-skill analytics, and no multi-tenant isolation. The goal is to mirror the existing `learned_routes` DB pattern — move metadata to Postgres while keeping skill *content* in markdown files. The JSON file remains as a fallback when `DATABASE_URL` is unset.

---

## What Changes (and What Doesn't)

**Not changing:**
- `skills/learned/*.md` content files — still written/read from disk
- `skills/universal-agent-skill-creator.md` and static skills
- `execute.ts` `readFileSync` skill loading and 8KB truncation
- `universal-skill-creator.ts` file-writing logic
- `isMaterialized()` — still an `existsSync` check
- Public API shape of `skillCandidatesStore` (methods/return types stay the same)

**Changing:**
- `load()`, `upsertCandidate()`, `incrementUsage()` become `async`
- Persist path gains a DB branch (JSON path kept as fallback/dual-write)

---

## Implementation Steps

### Step 1 — Add `skillCandidatesTable` to schema
**File:** `src/routing/learned-routes-db-schema.ts`

Append at the bottom (all required Drizzle imports already present):

```typescript
export const skillCandidatesTable = pgTable("skill_candidates", {
  id:                 text("id").primaryKey(),
  capability:         text("capability").notNull(),
  description:        text("description").notNull(),
  audience:           text("audience").notNull().default("marketer"),
  scope:              text("scope").notNull().default("global"),
  brandId:            text("brand_id"),
  suggestedSkillFile: text("suggested_skill_file").notNull(),
  triggerPatterns:    jsonb("trigger_patterns").$type<string[]>().notNull().default([]),
  confidence:         text("confidence").notNull().default("medium"),
  requiresApproval:   boolean("requires_approval").notNull().default(false),
  source:             text("source").notNull().default("agency"),
  addedAt:            timestamp("added_at", { withTimezone: true }).notNull(),
  lastUsedAt:         timestamp("last_used_at", { withTimezone: true }),
  usageCount:         integer("usage_count").notNull().default(0),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  capabilityIdx:    index("skill_candidates_capability_idx").on(table.capability),
  audienceScopeIdx: index("skill_candidates_audience_scope_idx").on(table.audience, table.scope),
  brandScopeIdx:    index("skill_candidates_brand_scope_idx").on(table.brandId, table.scope),
  usageCountIdx:    index("skill_candidates_usage_count_idx").on(table.usageCount),
}));
```

No `uniqueIndex` on capability — the store handles fuzzy dedup in memory; `id` is the DB uniqueness key.

---

### Step 2 — Create `SkillCandidatesDbRepository`
**New file:** `src/routing/skill-candidates-db-repository.ts`

Model exactly on `LearnedRoutesDbRepository`. Key differences:

- `init()` runs `CREATE TABLE IF NOT EXISTS skill_candidates (...)` inline (same DDL-in-init pattern)
- Methods:
  - `upsertSkill(candidate: SkillCandidate)` — conflict on `id`, update all fields + `updatedAt`
  - `incrementUsage(id: string)` — `usageCount + 1`, `lastUsedAt = now()`
  - `getAll()` — ordered by `usageCount DESC`, limit 5000
  - `getAllForContext({ audience?, scope?, brandId? })` — filtered query
  - `close()` — `pool.end()`
- Row↔domain helpers: `toRow()` / `fromRow()` converting ISO strings ↔ Date objects
- Fuzzy merge stays in the store layer (JavaScript); DB does only keyed upsert

---

### Step 3 — Update `src/platform/db-repository.ts`

Add alongside existing `getPlatformDbRepository()`:

```typescript
let cachedSkillCandidatesRepo: SkillCandidatesDbRepository | null = null;

export function getSkillCandidatesDbRepository(): SkillCandidatesDbRepository | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!cachedSkillCandidatesRepo) {
    cachedSkillCandidatesRepo = new SkillCandidatesDbRepository(url);
  }
  return cachedSkillCandidatesRepo;
}
```

---

### Step 4 — Update `src/routing/skill-candidates-store.ts`

- `load()`, `upsertCandidate()`, `incrementUsage()` become `async`
- DB path added to each; JSON path kept as fallback
- New env var `SKILL_CANDIDATES_DUAL_WRITE_JSON` controls sync-to-JSON when DB is primary
- `ensureLoaded()` guard throws if DB expected but `load()` was not awaited

---

### Step 5 — Update call sites in `src/trigger/`

| File | Change |
|------|--------|
| `src/trigger/execute.ts` | `await skillCandidatesStore.load()` |
| `src/trigger/orchestrate.ts` | `await skillCandidatesStore.load()` |
| `src/trigger/think.ts` | `await skillCandidatesStore.load()` |
| `src/trigger/skill-learner.ts` | `await skillCandidatesStore.load()` |
| `src/trigger/skill-learning.ts` | `await skillCandidatesStore.upsertCandidate(...)` |
| `src/trigger/think.ts` | `void skillCandidatesStore.incrementUsage(...)` (fire-and-forget) |

---

### Step 6 — Create migration utility
**New file:** `src/routing/skill-candidates-migration.ts`

- `importSkillCandidatesFromJsonToDb()` — idempotent, skips existing IDs
- `exportSkillCandidatesFromDbToJson()` — dumps DB → JSON file

---

### Step 7 — Add backfill script + npm scripts

**New file:** `scripts/skill-candidates-backfill.ts`

**`package.json` additions:**
```json
"skills:backfill": "tsx scripts/skill-candidates-backfill.ts import",
"skills:export":   "tsx scripts/skill-candidates-backfill.ts export"
```

---

## Dual-Write Behaviour

| `DATABASE_URL` | `SKILL_CANDIDATES_DUAL_WRITE_JSON` | Behaviour |
|---|---|---|
| unset | any | JSON only (unchanged) |
| set | unset / false | DB primary, JSON not written |
| set | true | DB primary + JSON kept in sync |

---

## Verification

1. **No-DB mode**: Unset `DATABASE_URL` — JSON read/written as before.
2. **DB backfill**: `DATABASE_URL=... npm run skills:backfill` — `imported: 3, skipped: 0`.
3. **DB load**: Logs `"Loaded 3 skill candidate(s) from DB"`.
4. **Dual-write**: Both DB row and JSON file updated after skill learning flow.
5. **DB fallback**: Invalid URL → logs warning, continues on JSON.
6. **`isMaterialized` unchanged**: Still `existsSync` regardless of DB mode.
7. **Round-trip**: `npm run skills:export` → JSON matches DB.
8. **No floating promises**: All `load/upsertCandidate/incrementUsage` calls are `await`ed or `void`-prefixed.
