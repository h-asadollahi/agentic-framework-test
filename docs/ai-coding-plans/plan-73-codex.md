# codex-plan-73

1. Decouple autonomous skill-learning from the critical response path.
   - Keep `pipeline-execute` focused on: subtask execution + agency summary assembly.
   - Remove blocking skill materialization from `pipeline-execute`.
   - `pipeline-execute` should only return parsed `skillSuggestions` (if any), not persist them inline.

2. Add a dedicated background task: `pipeline-skill-learner`.
   - New file: `src/trigger/skill-learner.ts`.
   - Input:
     - `sessionId`
     - `context`
     - `cognitionResult`
     - `skillSuggestions`
   - Responsibilities:
     - Apply existing anti-spam filters (context relevance, lock to matched materialized candidate, max one suggestion/run).
     - Persist candidate(s) and materialize file(s) via existing utility path.
     - Log outcomes and non-fatal errors.
   - Failure handling:
     - Never fail user response path.
     - Errors are logged and optionally routed as monitoring notifications only.

3. Run Interface and skill-learning in parallel from orchestrator.
   - Update `src/trigger/orchestrate.ts`:
     - After `executeRun.ok`, start `skillLearnerTask.trigger(...)` as fire-and-forget (no `await`).
     - Immediately call `deliverTask.triggerAndWait(...)` for user-facing response.
   - Preserve current API response contract and stage trace behavior.
   - Add trace/log annotation when skill-learning is queued.

4. Refactor shared skill-learning logic into reusable helpers.
   - Extract filtering/persistence helpers from `execute.ts` into a shared module, e.g.:
     - `src/trigger/skill-learning.ts`
   - `execute.ts` reuses parse-only logic.
   - `skill-learner.ts` reuses persistence/materialization logic.

5. Add guardrails for latency and recursion.
   - Ensure `pipeline-skill-learner` cannot trigger route-learning loops.
   - Hard cap work per run (1 suggestion max, strict time budget).
   - Skip execution when suggestions empty or invalid.

6. Tests.
   - Unit:
     - `execute` no longer blocks on persistence (parse-only behavior).
     - `skill-learner` applies anti-spam rules and persists correctly.
     - `orchestrate` triggers `skill-learner` asynchronously and still awaits `deliver`.
   - Regression:
     - Existing autonomous-skill-loop and skill-candidates tests remain green.
   - Optional timing assertion:
     - Verify `deliver` starts without waiting for skill materialization path.

7. Documentation and handover updates.
   - Update `docs/usage-guide.md` with new runtime behavior:
     - “skill-learning runs asynchronously after execution result is available.”
   - Update `docs/HANDOVER.md` with rollout notes and rollback strategy.

## Expected Outcome
- Marketer-facing response latency decreases because Interface starts immediately after Agency result assembly.
- Skill-learning still happens, but off the critical path.
- Reduced perceived stalls while preserving autonomous improvement.
