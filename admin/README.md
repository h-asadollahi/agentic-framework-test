# Admin App

Separate admin observability UI for learned routes.

## Run

```bash
node admin/server.mjs
```

Open `http://localhost:4174`.

## Requirements

- API server running (`npm run dev` or built server)
- Admin auth configured in API env:
  - `ADMIN_ALLOWED_IPS` and/or
  - `ADMIN_API_TOKEN`

The UI calls API `/admin/*` endpoints from the configured API base URL.
