# Plan 101 — VS Code-style collapsible tree for Knowledge Editor

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-01
**Scope:** Replace the flat grouped list in the Knowledge Editor file panel with a fully recursive, collapsible/expandable folder tree that mirrors VS Code's Explorer panel.

---

## Problem

The current file list in the Knowledge Editor groups files only by their top-level folder and renders them as flat rows. The `knowledge/` folder is two–three levels deep (e.g. `brands/northline-fashion/agents/grounding/system-prompt.md`), so the flat view is hard to navigate and gives no visual hierarchy.

---

## Deliverable

Replace `renderKnowledgeFileList()` in `admin/public/app.js` with a recursive tree renderer. No backend changes needed.

---

## Design (VS Code Explorer style)

```
▼ agents
  ▼ agency
      decision-logic.md
      system-prompt.md
  ▶ cognition
▼ brands
  ▼ northline-fashion
      soul.md
▶ sub-agents
  brand-guidelines.md   ← root-level files below all folders
  guardrails.md
  soul.md
```

### Tree node types
- **Folder row** — chevron (▶ collapsed / ▼ expanded) + folder icon + name. Click toggles open/close.
- **File row** — file icon + `name.md`. Click loads the file. Active file is accent-highlighted.
- Indentation: `depth × 12px` left padding.

### State added to `knowledgeState`
```js
collapsedFolders: new Set()   // folder paths that are currently collapsed
```

Folders start **expanded** by default (matching VS Code behaviour).

---

## Files changed

| File | Change |
|---|---|
| `admin/public/app.js` | Add `collapsedFolders` to `knowledgeState`; replace `renderKnowledgeFileList` with recursive tree builder + renderer; add `toggleKnowledgeFolder` helper |

---

## How to test

**Preconditions:** Admin UI running (`node admin/server.mjs`), main API running.

1. Open Knowledge Editor page.
2. Expect: file tree renders with folder rows showing ▼ chevron (expanded by default) and file rows indented beneath them.
3. Click a folder row → expect it collapses (▶ chevron, children hidden).
4. Click the same folder → expect it re-expands.
5. Click a file inside a nested folder (e.g. `brands/northline-fashion/soul.md`) → expect file loads in editor.
6. Active file row should be accent-coloured; all others default.
7. Collapsing a folder that contains the active file should not clear the editor.

**Not tested:** Persistence of collapsed state across page reloads (state is in-memory only by design).
