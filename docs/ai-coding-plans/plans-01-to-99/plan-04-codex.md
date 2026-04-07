# Codex Plan 04 — Demo Marketer Chat App

Date: 2026-03-06
Status: Completed

1. Create new `demo/` application scaffold
- Add a standalone frontend app in `demo/` (HTML/CSS/JS) with no extra dependency requirements.

2. Build marketer chat UX
- Add chat input and conversation timeline for marketer messages and assistant responses.
- Keep session continuity by reusing `sessionId` between requests.

3. Integrate with backend pipeline APIs
- `POST /message` to trigger runs.
- Poll `GET /status/:runId` until terminal state.
- Map run status into user-visible progress states.

4. Show “thinking/process” and completion artifacts
- Display execution stages from `trace` as step cards (grounding/cognition/agency/interface).
- Show per-step action, timing, and reasoning (when available).
- Show final formatted response + notifications/results summary.

5. Add local demo runner
- Add a tiny static-file server script for `demo/`.
- Add npm script(s) to run the demo quickly.

6. Documentation and persistence
- Add `demo/README.md` with run instructions.
- Update `docs/HANDOVER.md` with the new demo capability.
- Run validation (`npm test`, `npx tsc --noEmit`), mark this plan completed, then commit and push to `main`.
