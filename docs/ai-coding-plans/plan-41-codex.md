# Codex Plan 41

1. Move `soul.md` from repo root to `knowledge/soul.md`.
2. Update runtime sources:
   - `src/core/context.ts` default soul path
   - `src/tools/knowledge-tools.ts` readSoulFile path
3. Keep backward-compatible fallback in runtime (if root `soul.md` exists, still readable) to avoid breakage.
4. Update relevant prompt/docs/tests references from `soul.md` to `knowledge/soul.md` where they describe current architecture.
5. Run full unit test suite.
6. Update `docs/HANDOVER.md` with this migration, then commit/push (excluding unrelated local changes).
