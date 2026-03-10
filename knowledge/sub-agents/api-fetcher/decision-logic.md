# API Fetcher Sub-Agent Decision Logic

This file mirrors the current runtime behavior of `api-fetcher`.

## Runtime-Authoritative File

- `src/trigger/sub-agents/plugins/api-fetcher.ts`

## Execution Flow

1. Validate input (`routeId`, optional `params`).
2. Resolve learned route by `routeId` from `knowledge/learned-routes.json`.
3. Validate route type is `api` with endpoint details.
4. Resolve templates:
   - env placeholders: `{{ENV_VAR}}`
   - runtime params: `{{input.key}}`
5. Execute HTTP request with resolved method/url/headers/query/body.
6. Return structured output:
   - route ID
   - endpoint
   - status code
   - data
   - fetched timestamp
7. Increment learned-route usage on execution.

## Error Behavior

- Invalid input -> returns `success: false` with validation details.
- Unknown route -> returns `success: false` with route-not-found message.
- Non-API route -> returns `success: false` with route-type error.
- Fetch errors -> returns `success: false` with error message.

## AI Prompt Usage

- Prompt is runtime-loaded from:
  - `knowledge/sub-agents/api-fetcher/system-prompt.md`
- Runtime fetch behavior is deterministic and authoritative in code.

## Change Guidance

- Keep deterministic error handling stable for orchestration reliability.
- If route resolution rules change, update both code and this file.
- Keep this documentation synchronized with plugin implementation.
