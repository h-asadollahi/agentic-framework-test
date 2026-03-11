# codex-plan-71

1. Add execute-stage anti-spam policy for autonomous skill persistence:
   - Derive prompt anchor from cognition output.
   - If a materialized matching candidate already exists, only allow suggestions matching that exact capability/skill file.
2. Cap autonomous suggestion persistence to at most one suggestion per run (highest relevance score) to prevent burst creation.
3. Add/adjust unit tests in `tests/unit/autonomous-skill-loop.test.ts` for:
   - lock-to-existing-candidate behavior
   - one-suggestion cap behavior
4. Update `docs/HANDOVER.md` with root cause and implemented safeguards.
