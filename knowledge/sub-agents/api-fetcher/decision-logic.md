# API Fetcher Sub-Agent Decision Logic

This file mirrors the current runtime behavior of `api-fetcher`.

## Runtime-Authoritative File

- `src/trigger/sub-agents/plugins/api-fetcher.ts`

## Execution Flow

1. Validate input (`routeId`, optional `params`).
2. Resolve learned route by `routeId` from `knowledge/learned-routes.json`.
3. Validate route type is `api` with endpoint details.
4. Run deterministic preflight metadata generation based on `skills/mcp-builder-SKILL.md` for API-call routes.
5. Resolve templates:
   - env placeholders: `{{ENV_VAR}}`
   - runtime params: `{{input.key}}`
   - request body template file from `apiWorkflow.requestBodySource` when configured
6. Execute configured workflow:
   - `single-request`: one HTTP call
   - `analysis-query`: create -> optional poll -> fetch analysis result
   - `report-query`: create report -> poll report status -> fetch selected calculation results
7. Apply Mapp auth strategy:
   - use `MAPP_ANALYTICS_API_TOKEN`
   - on 401, refresh once via OAuth client-credentials and retry once
8. Return structured output:
   - route ID
   - workflow type
   - preflight metadata
   - compact execution/aggregation data
   - fetched timestamp
9. Increment learned-route usage on execution.

## Error Behavior

- Invalid input -> returns `success: false` with validation details.
- Unknown route -> returns `success: false` with route-not-found message.
- Non-API route -> returns `success: false` with route-type error.
- Template file issues -> returns `success: false` with file/path parse error.
- Workflow or fetch errors -> returns `success: false` with stage-aware error message and preflight context.

## AI Prompt Usage

- Prompt is runtime-loaded from:
  - `knowledge/sub-agents/api-fetcher/system-prompt.md`
- Runtime fetch behavior is deterministic and authoritative in code.

## Change Guidance

- Keep deterministic error handling stable for orchestration reliability.
- If route resolution rules change, update both code and this file.
- Keep this documentation synchronized with plugin implementation.
