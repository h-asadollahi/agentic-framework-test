# Plan 106 — Demo: extract each page into its own view module

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-01
**Scope:** Refactor the demo SPA so every nav item is a self-contained ES module view. The shell (`index.html` + `app.js`) only handles the sidebar and routing; adding a new page requires a single new file under `demo/views/`.

---

## Problem

All page HTML sits in `index.html` and all page logic sits in `app.js`. As the app grows (dashboard, settings, …) this becomes one large blob that is hard to reason about or extend.

---

## Target structure

```
demo/
├── index.html              ← shell only: sidebar + <div id="view-outlet">
├── app.js                  ← router + shared state/utilities (brand, API, markdown)
├── styles.css              ← unchanged
└── views/
    ├── chat.js             ← Chat page HTML + logic
    ├── knowledge-editor.js ← Knowledge Editor HTML + logic
    └── dashboard.js        ← Placeholder dashboard (for future use)
```

## View contract

Every view module exports exactly two functions:

```js
export function mount(outlet, ctx) { … }  // render HTML into outlet, wire events
export function unmount()           { … }  // clean up timers/listeners
```

`ctx` is a shared context object from `app.js`:

```js
{
  getApiBase,          // () => string
  getSelectedBrandId,  // () => string
  getSelectedBrandMeta // () => Brand | null
}
```

## Router

`app.js` defines a route table:

```js
const routes = {
  "#chat":             () => import("./views/chat.js"),
  "#knowledge-editor": () => import("./views/knowledge-editor.js"),
  "#dashboard":        () => import("./views/dashboard.js"),
};
```

On every `hashchange` the router:
1. Calls `currentView.unmount()` if a view is mounted
2. Dynamically imports the new view module
3. Calls `view.mount(outlet, ctx)`
4. Updates the active nav link

## Files changed

| File | Change |
|---|---|
| `demo/index.html` | Remove all page HTML; add `<div id="view-outlet">` in `<main>` |
| `demo/app.js` | Keep shared utilities + brand state; replace page logic with router |
| `demo/views/chat.js` | **new** — full chat page (HTML generation + all chat logic) |
| `demo/views/knowledge-editor.js` | **new** — full knowledge editor (HTML + VS Code tree + editor) |
| `demo/views/dashboard.js` | **new** — placeholder with coming-soon card |

## How to test

1. Open `http://localhost:4173` — expect Dashboard placeholder loads by default.
2. Click **Chat** → expect chat page mounts cleanly (ready message shown).
3. Click **Knowledge Editor** → expect file tree loads for selected brand.
4. Switch brands → expect Knowledge Editor reloads tree; Chat resets session.
5. Navigate Chat → Knowledge Editor → Chat — expect no duplicate event listeners, no memory leaks (unmount is called each time).
6. Directly load `http://localhost:4173#knowledge-editor` — expect correct page appears immediately.
