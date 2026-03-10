# Interface Agent Decision Logic

This document mirrors Interface-stage behavior in a human-readable form.

## Runtime-Authoritative Files

- `src/trigger/deliver.ts`
- `src/trigger/deliver-notifications.ts`
- `src/trigger/delivery-fidelity.ts`

## Delivery Flow

1. Input includes:
   - agency results/summary/issues
   - `needsHumanReview` flag
   - critical facts extracted from Agency output
   - render requirements built from guardrails/cognition
2. Interface agent formats marketer-facing response and proposes notifications.
3. Runtime parses Interface JSON output.
4. If output parse fails, runtime falls back to:
   - raw Interface text as `formattedResponse`
   - empty notifications list

## Post-Processing Guarantees

After Interface output is parsed, runtime enforces:

- Slack recipient normalization by intent:
  - marketer vs admin
  - HITL vs monitoring
- Human-review fallback notifications if required and missing.
- Monitoring fallback notifications for issues/failures if required and missing.
- Critical fact preservation:
  - append missing facts to `Detailed Findings` when needed.

## Why This Exists

- Keeps marketer-facing rendering and alert-routing policy transparent.
- Documents deterministic safeguards beyond model output.
- Helps human maintainers update notification behavior safely.

## Change Guidance

- Update this file whenever delivery formatting or notification routing policy changes.
- Keep synchronized with `deliver.ts`, `deliver-notifications.ts`, and `delivery-fidelity.ts`.
- Preserve post-processing safeguards even if prompt wording changes.
