# Codex Plan 30

1. Add a delivery fidelity helper that extracts critical facts from Agency output and defines human-readable rendering requirements.
2. Pass Grounding + Cognition context into `pipeline-deliver` so Interface has explicit constraints and intent context.
3. Update Interface prompt/input contract to enforce required sections and inclusion of critical facts.
4. Add a deterministic post-processing safeguard in `deliver` to append any missing critical facts in a human-readable section.
5. Add unit tests for the fidelity helper and run the full test suite.
6. Update `docs/HANDOVER.md`, then commit and push the implementation.
