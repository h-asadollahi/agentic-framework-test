# Plan 63 — Restore Local Trigger.dev Execution (Queued Jobs Fix)

## Goal
Fix queued runs not executing by repairing local Trigger platform health so `npm run trigger:dev` can connect and workers can pick jobs.

## Steps
1. Fix local Trigger docker stack config (`../trigger-dev-local`):
- Set Trigger image tag to v4 (`TRIGGER_IMAGE_TAG=v4.4.3`) to match CLI/sdk.
- Pass Electric security config (`ELECTRIC_INSECURE=true`) into the `electric` service env to stop crash loop.

2. Restart local docker stack:
- `docker compose down`
- `docker compose pull`
- `docker compose up -d`

3. Validate stack health:
- Ensure `trigger-dev-local-electric-1` is `Up` (not restarting).
- Check Trigger API health endpoint auth status is no longer platform-500.

4. Validate worker startup:
- Run `npm run trigger:dev` and verify it no longer fails with `Couldn't retrieve settings: 500`.

5. Document outcome:
- Update `docs/HANDOVER.md` with root cause/fix steps.
