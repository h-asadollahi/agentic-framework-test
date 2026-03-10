# MCP Fetcher Sub-Agent Decision Logic

This file mirrors the current runtime behavior of `mcp-fetcher`.

## Runtime-Authoritative File

- `src/trigger/sub-agents/plugins/mcp-fetcher.ts`

## Execution Flow

1. Hydrate input from learned-route defaults when `routeId` is provided and required MCP fields are missing.
2. Validate input (`serverName`, `toolName`, optional `args`, optional `params`).
3. Resolve MCP tool list from configured `serverName`.
4. Verify target `toolName` exists and is executable.
5. Build tool args from defaults + runtime params with template resolution.
6. Execute tool and shape output:
   - compact dimensions/metrics catalog responses
   - truncate oversized payloads with metadata
7. Return structured output:
   - server name
   - tool name
   - resolved args
   - data
   - execution timestamp
8. Increment learned-route usage when `routeId` is provided.

## Error Behavior

- Invalid input -> `success: false` with validation details.
- Tool missing/not executable -> `success: false` with explicit error payload.
- Tool execution failure -> `success: false` with failure context.

## AI Prompt Usage

- Prompt is runtime-loaded from:
  - `knowledge/sub-agents/mcp-fetcher/system-prompt.md`
- MCP execution logic remains deterministic and authoritative in code.

## Change Guidance

- Keep output-shaping safeguards to prevent oversized pipeline payloads.
- Keep input hydration behavior aligned with learned-route schema updates.
- Keep this file synchronized with plugin implementation.
