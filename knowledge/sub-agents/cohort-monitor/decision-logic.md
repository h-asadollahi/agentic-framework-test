# Cohort Monitor Sub-Agent Decision Logic

This file mirrors the current runtime behavior of `cohort-monitor`.

## Runtime-Authoritative File

- `src/trigger/sub-agents/plugins/cohort-monitor.ts`

## Current Execution Mode (Mock-First)

`cohort-monitor` currently overrides `execute()` and uses deterministic mock data.
This means:

1. Input is validated/coerced with optional defaults.
2. If no specific metric is requested, it returns a cohort overview payload.
3. If a metric is requested, it returns single-metric cohort output.
4. If parsing fails unexpectedly, it returns default mock data safely.

## AI Prompt Usage

- `getSystemPrompt()` is maintained and runtime-loaded from:
  - `knowledge/sub-agents/cohort-monitor/system-prompt.md`
- This prompt is intended for the future AI/tool-driven execution mode.

## Change Guidance

- Keep mock-mode execution stable until real data connectors are introduced.
- If switching to AI mode (`super.execute(...)`), update this file and add test coverage for tool-based behavior.
- Keep this documentation synchronized with the plugin implementation.
