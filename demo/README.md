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

- Default API base in the UI is `http://localhost:3000`.
- The app shows:
  - status transitions for each run
  - final formatted response
  - pipeline trace steps (grounding/cognition/agency/interface)
  - notification count when present
