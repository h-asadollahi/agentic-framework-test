# Demo Marketer Chat

A lightweight demo UI to chat as a marketer and inspect pipeline execution steps.

## Run

1. Start the API server:

```bash
npm run dev
```

2. In another terminal, run the demo app:

```bash
npm run demo
```

3. Open:

```text
http://localhost:4173
```

## Notes

- Default API base in the UI is `http://localhost:3001`.
- On load, the UI auto-detects the API by probing:
  - `http://localhost:3001/health`
  - `http://localhost:3000/health`
- If detection fails, set `API Base` manually in the top-right input.
- The app shows:
  - status transitions for each run
  - final formatted response
  - pipeline trace steps (grounding/cognition/agency/interface)
  - notification count when present

## Self-Improving Skills

This project includes a reusable skill creator at:

- `skills/universal-agent-skill-creator.md`

Purpose:
- Helps agents and sub-agents generate a new, reusable skill when they identify repeated workflows or missing capabilities.

Current behavior:
- The runtime can route unknown/general API-oriented work through this universal skill creator flow.
- New skills produced by this flow should be saved in the `skills/` folder for future reuse.

Developer guidance:
- Keep generated skills specific, testable, and task-oriented.
- If a new skill is adopted by an agent/sub-agent, document that usage in `docs/HANDOVER.md`.
