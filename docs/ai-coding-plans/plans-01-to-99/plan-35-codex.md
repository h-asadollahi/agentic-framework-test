# Codex Plan 35

1. Introduce an API-call intent detector in Agency execution:
   - Detect subtasks that are clearly requesting API integration/building (e.g., "create MCP server", "connect API", "build integration endpoint").
   - Keep existing learned-route and sub-agent execution paths unchanged for normal requests.

2. Add a new Agency branch for MCP-builder workflow:
   - When API-call intent is detected, execute a deterministic "mcp-builder guidance" branch before standard fallback.
   - This branch should use `skills/mcp-builder-SKILL.md` as the instruction source to produce structured implementation guidance (not silent fallback text).

3. Implement a reusable MCP-builder module:
   - Parse and summarize actionable sections from `skills/mcp-builder-SKILL.md`.
   - Return a structured output for Agency (`plan`, `requiredInputs`, `toolingChoice`, `nextSteps`, `risks`).
   - Ensure output stays human-readable and compatible with downstream Interface formatting.

4. Wire this branch into `src/trigger/execute.ts`:
   - Apply only when the subtask is API/MCP-build oriented and no existing learned route should handle it.
   - Preserve current behavior for existing sub-agent routes (`mcp-fetcher`, `cohort-monitor`, `api-fetcher`) and LLM fallback.

5. Add test coverage:
   - Positive case: API-call prompt triggers MCP-builder branch.
   - Negative case: normal analytics prompt does not trigger MCP-builder branch.
   - Regression case: learned-route execution still preferred when matched.

6. Update documentation:
   - Add a usage-guide section with prompts that trigger MCP-builder behavior.
   - Update handover with architecture and routing decision notes.

7. Validate:
   - Run unit tests and targeted run(s) to confirm Agency routing decisions and output format.
