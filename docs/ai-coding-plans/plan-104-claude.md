# Plan 104 — Marketer Demo: brand-scoped Knowledge Editor + admin UI parity

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-01
**Scope:** Redesign the demo UI to match the admin UI style and add two features: a chat panel (matching admin Chat) and a brand-scoped Knowledge Editor that shows only the selected brand's own `.md` files.

---

## Problem

The demo (`demo/`) is a minimal single-page chat console with its own colour scheme. Marketers have no way to view or edit their brand knowledge files. The admin Knowledge Editor exists but gives access to all brands — it must never be exposed to marketers.

---

## Deliverables

### 1. Backend — brand-scoped knowledge routes (`src/`)

**Extend `src/admin/knowledge-fs.ts`** with three brand-scoped helpers:

```ts
listBrandFiles(brandId)           → KnowledgeFile[] under knowledge/brands/{brandId}/
readBrandFile(brandId, path)      → string
writeBrandFile(brandId, path, content)
```

Security:
- `brandId` validated with `/^[a-zA-Z0-9_-]+$/` — prevents traversal via the brandId param itself
- Resolved path must start with `KNOWLEDGE_ROOT/brands/{brandId}/` (same guard as admin)
- `.md` only, write only to existing files, 512 KB cap (same rules as admin)

**Add public routes to `src/public/routes.ts`** (no admin auth required — public marketer API):

```
GET  /brands/:brandId/knowledge/files
GET  /brands/:brandId/knowledge/file?path=<rel>
PUT  /brands/:brandId/knowledge/file          body: { path, content }
```

These sit alongside the existing `GET /brands` public route.

### 2. Demo — full UI redesign (`demo/`)

**Match admin UI** (purple/cream palette, sidebar layout, `surface-card` panels):

```
┌──────────────────────────────────────────────┐
│ Sidebar (260px)    │ Main content             │
│ ─────────────────  │ ─────────────────────── │
│ Brand selector     │  [Chat page]             │
│ ─────────────────  │   or                     │
│ • Chat             │  [Knowledge Editor page] │
│ • Knowledge Editor │                          │
└──────────────────────────────────────────────┘
```

- **Chat page**: same UI as before (message log + composer), restyled to match admin
- **Knowledge Editor page**: VS Code-style collapsible tree (only `knowledge/brands/{brandId}/`) + textarea editor with Save — identical logic to admin but brand-scoped
- **Brand switch** resets session and reloads the knowledge file tree

---

## Files changed

| File | Change |
|---|---|
| `src/admin/knowledge-fs.ts` | Add `listBrandFiles`, `readBrandFile`, `writeBrandFile` |
| `src/public/routes.ts` | Add 3 brand-scoped knowledge routes |
| `demo/index.html` | Full redesign: sidebar layout, admin colour palette, two pages |
| `demo/app.js` | Add sidebar nav, brand-scoped knowledge tree + editor, keep chat logic |
| `demo/styles.css` | Replace teal/pink palette with admin purple/cream design tokens |

---

## Security design

| Threat | Mitigation |
|---|---|
| Marketer accesses another brand's files | `brandId` locked to URL param; server resolves to `knowledge/brands/{brandId}/` only |
| Path traversal via `path` param | Same `resolveSafePath` guard as admin (normalize + startsWith check) |
| Traversal via `brandId` param | Regex `/^[a-zA-Z0-9_-]+$/` rejects any path characters |
| Accessing global knowledge files | Root path is `knowledge/brands/{brandId}/` — no route to `knowledge/soul.md` etc. |
| Creating new files | `writeBrandFile` requires file to already exist (stat check) |

---

## How to test

**Preconditions:** Demo running (`node demo/server.mjs`, port 4173), main API running (port 3001).

1. Open `http://localhost:4173`.
2. Select **Northline Fashion** from the brand selector.
3. Click **Knowledge Editor** in the sidebar.
4. Expect: file tree shows only `knowledge/brands/northline-fashion/` files.
5. Click `soul.md` → content loads in the editor.
6. Make an edit → Save → reload and reopen → confirm change persisted.
7. Switch to **Acme Marketing** → expect: tree clears and loads only acme files (or shows empty if no brand folder exists).
8. Try the **Chat** page — send a message → expect pipeline response as before.
9. Verify `GET /brands/northline-fashion/knowledge/files` returns only northline files.
10. Attempt `GET /brands/northline-fashion/knowledge/file?path=../../soul.md` → expect 400 error.
