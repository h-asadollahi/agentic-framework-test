# Codex Plan 28

1. Add a shared parser utility for agent JSON output that:
   - Parses plain JSON directly.
   - Parses JSON wrapped in markdown code fences (for example, ```json ... ```).
   - Falls back safely when no valid JSON object can be extracted.
2. Refactor `pipeline-think`, `pipeline-execute`, and `pipeline-deliver` to use the shared parser so cognition/agency/interface do not incorrectly fall back when model output is fenced JSON.
3. Add unit tests for the parser utility and stage-level behaviors that depend on parsed fields (`reasoning`, `issues`, `needsHumanReview`, `notifications`).
4. Run the test suite (or targeted tests) and ensure all new tests pass.
5. Update `docs/HANDOVER.md` with the fix details, scope, and verification results.
