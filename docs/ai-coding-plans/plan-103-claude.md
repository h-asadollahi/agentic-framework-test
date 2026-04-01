# Plan 103 — Fix: Knowledge Editor files not loading on initial page visit

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-01
**Scope:** Bug fix — knowledge file tree shows "Loading…" forever on first visit.

> ⚠️ Note: this plan was written retroactively. The fix (commit `530457a`) was already pushed before this doc was created — that violated the repo guidelines. Plan-first is required for all code changes regardless of size.

---

## Problem

`loadKnowledgeFiles()` was wired only to the `hashchange` event listener:

```js
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#knowledge-editor" && !knowledgeState.files.length) {
    loadKnowledgeFiles();
  }
});
```

`hashchange` fires only when the URL hash *changes*. On initial page load (or hard refresh) the hash never changes, so `loadKnowledgeFiles()` is never called. The `index.html` placeholder "Loading…" text sits there indefinitely.

---

## Fix

Add `loadKnowledgeFiles()` to `loadAll()`, which runs in `bootstrap()` on every page load:

```js
async function loadAll() {
  await Promise.all([
    ...
    loadKnowledgeFiles(),   // ← added
  ]);
}
```

The existing `hashchange` guard (`!knowledgeState.files.length`) still prevents a duplicate reload when navigating to the page after files are already in state.

---

## Files changed

| File | Change |
|---|---|
| `admin/public/app.js` | Added `loadKnowledgeFiles()` to the `Promise.all` in `loadAll()` |

---

## How to test

1. Hard-refresh the Admin UI (`Cmd+Shift+R`) while on any page.
2. Navigate to Knowledge Editor.
3. Expect: file tree renders immediately — no "Loading…" stuck state.
4. Navigate away and back — expect: tree does not re-fetch (files already in state).
