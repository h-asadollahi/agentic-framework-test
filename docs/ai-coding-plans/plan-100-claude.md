# Plan 100 — Knowledge Editor in Admin UI

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)  
**Date:** 2026-04-01  
**Scope:** Allow admins to browse and edit `.md` files in the `knowledge/` folder through the existing Admin UI.

---

## Problem

Agent behaviour is driven by `.md` files in `knowledge/` (soul, guardrails, agent prompts, brand overrides). Today those files can only be edited via SSH/IDE. With a multi-brand setup the admin needs a safe, in-browser way to read and overwrite them.

---

## Deliverables

1. **`src/admin/knowledge-fs.ts`** — safe file-access module (no routes, no HTTP)
2. Three new admin API routes in **`src/admin/routes.ts`**
3. **Knowledge Editor** page in the Admin UI (`admin/public/index.html` + `admin/public/app.js`)

---

## Security design

| Threat | Mitigation |
|---|---|
| Path traversal (`../../etc/passwd`) | `path.normalize` + assert resolved path starts with `KNOWLEDGE_ROOT + path.sep` |
| Absolute paths | Rejected before `path.resolve()` via `path.isAbsolute()` |
| Non-markdown access | Extension enforced: `.md` only |
| Creating new files | `writeKnowledgeFile` calls `fs.stat` first — 404 if file doesn't exist |
| Oversized content | 512 KB cap on both read and write |
| Unauthenticated access | All three routes sit behind existing `createAdminAuthMiddleware()` |

---

## API surface

```
GET  /admin/knowledge/files              → { files: KnowledgeFile[] }
GET  /admin/knowledge/file?path=<rel>    → { path, content }
PUT  /admin/knowledge/file               body: { path, content }  → { ok, path }
```

`path` is always a forward-slash relative path from the `knowledge/` root (e.g. `brands/northline-fashion/soul.md`).

---

## Files changed

| File | Change |
|---|---|
| `src/admin/knowledge-fs.ts` | **new** — `listKnowledgeFiles`, `readKnowledgeFile`, `writeKnowledgeFile` |
| `src/admin/routes.ts` | Added import + 3 new routes before `app.route("/admin", admin)` |
| `admin/public/index.html` | Added nav link (book icon) + `knowledgeEditorPage` section |
| `admin/public/app.js` | Added `pageConfig` entry, `setActivePage` mapping, full editor logic |

---

## How to test

**Preconditions:**
- Admin UI running: `node admin/server.mjs` (port 4174 by default)
- Main API running: `npm run dev` (port 3001)
- `ADMIN_API_TOKEN` set in `.env`

**Steps:**
1. Open `http://localhost:4174` → click **Knowledge Editor** in the sidebar.
2. Expect: file tree appears listing all `.md` files grouped by subfolder.
3. Click `soul.md` (root level).
4. Expect: content loads in the textarea; Save button is disabled.
5. Make a trivial edit (add a blank line).
6. Expect: Save button becomes enabled (dirty state).
7. Click Save → expect: "Saved successfully." status message.
8. Reload the page, reopen the file → confirm the change persisted.

**Failure signals:**
- 403 on any `/admin/knowledge/*` call → auth not configured or token mismatch
- "Path traversal is not allowed" → attempted path escape (should never reach UI users)
- Save button stays enabled after save → check network tab for PUT error response

**Not tested (manual needed):**
- Live agent run picking up the edited file (requires a full pipeline trigger after save)
