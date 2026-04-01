// ── Knowledge Editor view ──────────────────────────────────────────────────────
// Brand-scoped: only shows knowledge/brands/{brandId}/ files.
// Exported interface: mount(outlet, ctx) / unmount() / onBrandChange() / onApiBaseChange()

let _ctx = null;

const state = {
  files: [],
  selectedPath: null,
  originalContent: null,
  dirty: false,
  collapsedFolders: new Set(),
};

function esc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function setStatus(msg) {
  const el = document.getElementById("ke-status");
  if (el) el.textContent = msg;
}

// ── Tree ──────────────────────────────────────────────────────────────────────
function buildTree(files) {
  const root = { children: {} };
  for (const f of files) {
    const parts = f.path.split("/"); let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!node.children[p]) node.children[p] = { name: p, type: "folder", children: {} };
      node = node.children[p];
    }
    const last = parts[parts.length - 1];
    node.children[last] = { name: f.name + ".md", type: "file", filePath: f.path };
  }
  return root;
}

const CHV_R = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHV_D = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FLD_C = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--warning)" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5H12.5A1.5 1.5 0 0 1 14 6v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11V4.5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/></svg>`;
const FLD_O = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--warning)" aria-hidden="true"><path d="M2 5A1.5 1.5 0 0 1 3.5 3.5h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v1H2V5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/><path d="M2 7.5h12l-1.5 5H3.5L2 7.5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/></svg>`;
const FILE  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--soft-muted)" aria-hidden="true"><path d="M4 2h5.5L12 4.5V14H4V2z" stroke="currentColor" stroke-width="1.4" fill="rgba(142,126,255,.12)"/><path d="M9.5 2v2.5H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function renderNode(node, depth, folderPath) {
  const indent = depth * 12;
  let html = "";
  const sorted = Object.values(node.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of sorted) {
    if (child.type === "folder") {
      const cp = folderPath ? `${folderPath}/${child.name}` : child.name;
      const col = state.collapsedFolders.has(cp);
      html += `<button class="ktree-folder" data-folder="${esc(cp)}" style="display:flex;align-items:center;gap:5px;width:100%;text-align:left;padding:3px 8px 3px ${indent+6}px;background:transparent;border:none;border-radius:4px;font-size:.81rem;font-weight:500;color:var(--text);cursor:pointer;transition:background .1s" title="${esc(cp)}">${col?CHV_R:CHV_D}${col?FLD_C:FLD_O}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(child.name)}</span></button>`;
      if (!col) html += renderNode(child, depth + 1, cp);
    } else {
      const active = child.filePath === state.selectedPath;
      html += `<button class="ktree-file${active?" active":""}" data-path="${esc(child.filePath)}" style="display:flex;align-items:center;gap:5px;width:100%;text-align:left;padding:3px 8px 3px ${indent+18}px;background:${active?"var(--accent-soft)":"transparent"};border:none;border-radius:4px;font-size:.81rem;color:${active?"var(--accent-deep)":"var(--text)"};font-weight:${active?"600":"400"};cursor:pointer;transition:background .1s" title="${esc(child.filePath)}">${FILE}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(child.name)}</span></button>`;
    }
  }
  return html;
}

function renderTree() {
  const container = document.getElementById("ke-file-list");
  if (!container) return;
  if (!state.files.length) { container.innerHTML = '<div class="empty-state" style="padding:1rem;">No .md files found for this brand.</div>'; return; }
  const tree = buildTree(state.files);
  container.innerHTML = `<div style="padding:4px 0">${renderNode(tree, 0, "")}</div>`;

  container.querySelectorAll(".ktree-folder").forEach((btn) => {
    btn.addEventListener("mouseenter", () => { btn.style.background = "var(--accent-soft)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    btn.addEventListener("click", () => {
      const fp = btn.dataset.folder;
      state.collapsedFolders.has(fp) ? state.collapsedFolders.delete(fp) : state.collapsedFolders.add(fp);
      renderTree();
    });
  });
  container.querySelectorAll(".ktree-file").forEach((btn) => {
    btn.addEventListener("mouseenter", () => { if (btn.dataset.path !== state.selectedPath) { btn.style.background="var(--accent-soft)"; btn.style.opacity="0.7"; } });
    btn.addEventListener("mouseleave", () => { if (btn.dataset.path !== state.selectedPath) { btn.style.background="transparent"; btn.style.opacity="1"; } });
    btn.addEventListener("click", () => selectFile(btn.dataset.path));
  });
}

// ── File I/O ──────────────────────────────────────────────────────────────────
async function selectFile(filePath) {
  if (state.dirty && !confirm("You have unsaved changes. Discard and open a new file?")) return;
  state.selectedPath = filePath; state.dirty = false;
  renderTree();

  const textarea = document.getElementById("ke-textarea");
  const meta = document.getElementById("ke-meta");
  const saveBtn = document.getElementById("ke-save-btn");
  textarea.disabled = true; textarea.value = "";
  if (saveBtn) saveBtn.disabled = true;
  if (meta) meta.innerHTML = `<span class="eyebrow subtle">Loading <code>${esc(filePath)}</code>…</span>`;
  setStatus("");

  try {
    const brandId = _ctx.getSelectedBrandId();
    const res = await fetch(`${_ctx.getApiBase()}/brands/${encodeURIComponent(brandId)}/knowledge/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    textarea.value = data.content;
    state.originalContent = data.content;
    textarea.disabled = false;
    if (meta) meta.innerHTML = `<code style="font-size:.8rem;color:var(--accent-deep)">${esc(filePath)}</code>`;
    setStatus("Loaded — edit and press Save to persist.");
  } catch (err) {
    setStatus(`Error loading file: ${err.message}`);
    if (meta) meta.innerHTML = `<span class="eyebrow subtle" style="color:var(--danger)">Failed to load</span>`;
  }
}

async function saveFile() {
  const filePath = state.selectedPath;
  const textarea = document.getElementById("ke-textarea");
  const saveBtn = document.getElementById("ke-save-btn");
  if (!filePath || !textarea) return;
  saveBtn.disabled = true; setStatus("Saving…");
  try {
    const brandId = _ctx.getSelectedBrandId();
    const res = await fetch(`${_ctx.getApiBase()}/brands/${encodeURIComponent(brandId)}/knowledge/file`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content: textarea.value }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    state.originalContent = textarea.value; state.dirty = false;
    saveBtn.disabled = true; setStatus("Saved successfully.");
  } catch (err) {
    setStatus(`Save failed: ${err.message}`); saveBtn.disabled = false;
  }
}

async function loadFiles() {
  const container = document.getElementById("ke-file-list");
  if (container) container.innerHTML = '<div class="empty-state" style="padding:1rem;">Loading…</div>';

  // Reset editor state
  Object.assign(state, { files: [], selectedPath: null, originalContent: null, dirty: false });
  state.collapsedFolders.clear();

  const textarea = document.getElementById("ke-textarea");
  const meta = document.getElementById("ke-meta");
  const saveBtn = document.getElementById("ke-save-btn");
  if (textarea) { textarea.value = ""; textarea.disabled = true; }
  if (meta) meta.innerHTML = `<span class="eyebrow subtle">No file selected</span>`;
  if (saveBtn) saveBtn.disabled = true;
  setStatus("");

  try {
    const brandId = _ctx.getSelectedBrandId();
    const res = await fetch(`${_ctx.getApiBase()}/brands/${encodeURIComponent(brandId)}/knowledge/files`);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    state.files = data.files || [];
    renderTree();
  } catch (err) {
    if (container) container.innerHTML = `<div class="empty-state" style="padding:1rem;color:var(--danger)">Error: ${esc(err.message)}</div>`;
  }
}

// ── View lifecycle ────────────────────────────────────────────────────────────
export function mount(outlet, ctx) {
  _ctx = ctx;
  const brand = ctx.getSelectedBrandMeta();

  outlet.innerHTML = `
    <section class="page">
      <section class="surface-card page-header-card">
        <div class="page-head">
          <div>
            <p class="eyebrow subtle">Knowledge Editor</p>
            <h2>${brand?.name || "Brand"} — Knowledge Files</h2>
            <p>View and edit your brand's <code>.md</code> knowledge files. Changes are picked up by agents on their next run.</p>
          </div>
          <button class="btn-primary" id="ke-save-btn" disabled>Save</button>
        </div>
      </section>

      <div class="knowledge-layout">
        <section class="surface-card knowledge-tree-card">
          <p class="eyebrow subtle tree-label">Files</p>
          <div id="ke-file-list"><div class="empty-state" style="padding:1rem;">Loading…</div></div>
        </section>
        <section class="surface-card knowledge-editor-card">
          <div id="ke-meta" class="editor-meta"><span class="eyebrow subtle">No file selected</span></div>
          <textarea id="ke-textarea" class="editor-textarea" spellcheck="false" disabled placeholder="Select a file from the tree to start editing."></textarea>
          <p id="ke-status" class="editor-status"></p>
        </section>
      </div>
    </section>`;

  document.getElementById("ke-save-btn").addEventListener("click", saveFile);
  document.getElementById("ke-textarea").addEventListener("input", () => {
    const saveBtn = document.getElementById("ke-save-btn");
    const textarea = document.getElementById("ke-textarea");
    state.dirty = textarea.value !== state.originalContent;
    if (saveBtn) saveBtn.disabled = !state.dirty;
  });

  loadFiles();
}

export function unmount() {
  _ctx = null;
}

export function onBrandChange() {
  const brand = _ctx?.getSelectedBrandMeta();
  const h2 = document.querySelector("#view-outlet h2");
  if (h2) h2.textContent = `${brand?.name || "Brand"} — Knowledge Files`;
  loadFiles();
}

export function onApiBaseChange() {
  loadFiles();
}
