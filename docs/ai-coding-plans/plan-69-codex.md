# codex-plan-69

1. Add execute-stage skill suggestion relevance filtering so only suggestions tied to the active cognition plan/subtasks are persisted/materialized.
2. Add fuzzy deduplication in `skill-candidates-store` to merge semantically similar suggestions (not only exact capability/path matches).
3. Add unit tests covering:
   - irrelevant/internal suggestion filtering for a monthly usage prompt context
   - fuzzy dedupe by trigger-pattern and capability similarity
4. Update `docs/HANDOVER.md` with root cause and anti-spam safeguards.
