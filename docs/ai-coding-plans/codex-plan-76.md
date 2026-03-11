# codex-plan-76

Status: Implemented on 2026-03-11.

1. Constrain cognition plans for deterministic single-route prompts:
   - Add post-processing in `pipeline-think` to remove redundant synthesis-only `general/assistant` subtasks when exactly one deterministic route subtask is present.
   - Keep non-synthesis and non-safe subtasks unchanged.
2. Add execute-time safety skip for redundant synthesis subtasks:
   - In `pipeline-execute`, skip runtime execution of synthesis-only `general/assistant` subtasks when they only depend on successful deterministic route results.
   - Return deterministic synthetic result (`modelUsed: deterministic-skip`) so downstream stages still have a complete result graph.
3. Add tests:
   - Cognition post-processing pruning tests.
   - Execute skip helper tests.
4. Run focused unit tests and benchmark with exact prompt:
   - `"How many API calculations have I used this month?"`
5. Update `docs/HANDOVER.md` and `docs/usage-guide.md` with behavior and measured impact.

## Result

- Implemented in:
  - `src/trigger/think.ts`
  - `src/trigger/execute.ts`
  - `tests/unit/think-deterministic-optimization.test.ts`
  - `tests/unit/execute-fast-path.test.ts`
- Validation:
  - Full tests passed (`179/179`).
  - Benchmark prompt: `How many API calculations have I used this month?`
  - Baseline `pipeline-execute`: `41,368ms` (`run_cmmm07ara00573annlempsi2z`)
  - Optimized `pipeline-execute`: `3,184ms` (`run_cmmm22vpw00693ann1avwcxn1`)
