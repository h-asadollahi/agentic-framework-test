# Codex Plan 32

1. Harden delivery-fidelity extraction so raw machine payloads (JSON blobs / tool envelopes) are never added as critical facts.
2. Add safeguards for excessively long lines to avoid unreadable bullets in `Detailed Findings`.
3. Add regression tests using MCP-style JSON payload examples to ensure they are excluded.
4. Run tests and validate no regressions.
5. Update `docs/HANDOVER.md`, then commit and push.
