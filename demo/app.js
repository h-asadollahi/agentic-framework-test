// ── DOM refs ──────────────────────────────────────────────────────────────────
const chatLog         = document.getElementById("chatLog");
const promptInput     = document.getElementById("promptInput");
const sendBtn         = document.getElementById("sendBtn");
const apiBaseInput    = document.getElementById("apiBase");
const brandIdInput    = document.getElementById("brandId");
const brandDescription = document.getElementById("brandDescription");
const sessionInfo     = document.getElementById("sessionInfo");
const messageTemplate = document.getElementById("messageTemplate");

// ── State ─────────────────────────────────────────────────────────────────────
let sessionId  = null;
let isRunning  = false;
let loaderEl   = null;

const FALLBACK_BRANDS = [
  { id: "acme-marketing",    name: "Acme Marketing",    description: "Seeded default marketing brand" },
  { id: "northline-fashion", name: "Northline Fashion", description: "Seeded fashion brand with stricter guardrails" },
];
let knownBrands = [...FALLBACK_BRANDS];

const API_CANDIDATES = ["http://localhost:3001", "http://localhost:3000"];

// ── Navigation ────────────────────────────────────────────────────────────────
function setActivePage(page) {
  const pages = { chat: "chatPage", knowledge: "knowledgeEditorPage" };
  for (const [name, id] of Object.entries(pages)) {
    const el = document.getElementById(id);
    if (el) el.hidden = name !== page;
  }
}

function setActiveNav(hash) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
}

function syncPageFromHash() {
  const hash = window.location.hash || "#chat";
  if (hash === "#knowledge-editor") {
    setActivePage("knowledge");
    setActiveNav("#knowledge-editor");
    if (!knowledgeState.files.length) loadKnowledgeFiles();
  } else {
    setActivePage("chat");
    setActiveNav("#chat");
  }
}

window.addEventListener("hashchange", syncPageFromHash);

// ── Brand helpers ─────────────────────────────────────────────────────────────
function getApiBase() {
  return (apiBaseInput?.value || "http://localhost:3001").trim().replace(/\/$/, "");
}

function getSelectedBrandId() {
  return brandIdInput?.value || "acme-marketing";
}

function getSelectedBrandMeta() {
  return knownBrands.find((b) => b.id === getSelectedBrandId()) ?? null;
}

function updateBrandDescription() {
  if (!brandDescription) return;
  const brand = getSelectedBrandMeta();
  brandDescription.textContent = brand?.description || "";
}

function populateBrandSelector(brands, defaultBrandId, preferredBrandId = null) {
  knownBrands = Array.isArray(brands) && brands.length ? brands : knownBrands;
  if (!brandIdInput) return;

  const desired =
    preferredBrandId && knownBrands.some((b) => b.id === preferredBrandId)
      ? preferredBrandId
      : knownBrands.some((b) => b.id === defaultBrandId)
        ? defaultBrandId
        : knownBrands[0]?.id || "acme-marketing";

  brandIdInput.innerHTML = "";
  for (const brand of knownBrands) {
    const opt = document.createElement("option");
    opt.value = brand.id;
    opt.textContent = brand.name;
    brandIdInput.appendChild(opt);
  }
  brandIdInput.value = desired;
  updateBrandDescription();

  // Update page titles with brand name
  const meta = getSelectedBrandMeta();
  const chatTitle = document.getElementById("chatPageTitle");
  const knowledgeTitle = document.getElementById("knowledgePageTitle");
  if (chatTitle) chatTitle.textContent = `${meta?.name || desired} — Chat`;
  if (knowledgeTitle) knowledgeTitle.textContent = `${meta?.name || desired} — Knowledge`;
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
function showLoader(text = "Processing...") {
  removeLoader();
  loaderEl = document.createElement("div");
  loaderEl.className = "pipeline-loader";
  loaderEl.innerHTML = `<div class="spinner"></div><span class="loader-text">${text}</span>`;
  chatLog.appendChild(loaderEl);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateLoaderText(text) {
  if (loaderEl) loaderEl.querySelector(".loader-text").textContent = text;
}

function removeLoader() {
  if (loaderEl) { loaderEl.remove(); loaderEl = null; }
}

function clearChatLog() {
  removeLoader();
  chatLog.innerHTML = "";
}

function resetSessionState(message) {
  sessionId = null;
  if (sessionInfo) sessionInfo.textContent = "Session: not started";
  clearChatLog();
  addMessage("system", message);
}

function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function addMessage(role, body) {
  const node = messageTemplate.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector(".role").textContent = role.toUpperCase();
  node.querySelector(".stamp").textContent = nowStamp();

  const bodyEl = node.querySelector(".message-body");
  if (typeof body === "string") {
    bodyEl.textContent = body;
  } else {
    bodyEl.appendChild(body);
  }

  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ── Markdown / JSON rendering (unchanged from original) ───────────────────────
function tryParseJsonString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function extractJsonFromFencedBlock(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!match) return null;
  return tryParseJsonString(match[1]);
}

function tryParsePossiblyJson(value) {
  if (typeof value !== "string") return null;
  return tryParseJsonString(value) || extractJsonFromFencedBlock(value);
}

function normalizeMarkdownForRendering(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^[-*]\s+\|.+\|\s*$/.test(trimmed)) {
        return line.replace(/^(\s*)[-*]\s+(\|.+\|\s*)$/, "$1$2");
      }
      return line;
    })
    .join("\n");
}

function getReadableAssistantText(output) {
  const raw = output?.formattedResponse;
  if (typeof raw !== "string") return "No formatted response was returned.";
  const fromDirect = tryParseJsonString(raw);
  if (fromDirect && typeof fromDirect.formattedResponse === "string") return fromDirect.formattedResponse;
  const fromFenced = extractJsonFromFencedBlock(raw);
  if (fromFenced && typeof fromFenced.formattedResponse === "string") return fromFenced.formattedResponse;
  return raw;
}

function renderInlineMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, match;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("**")) { const s = document.createElement("strong"); s.textContent = token.slice(2,-2); fragment.appendChild(s); }
    else if (token.startsWith("`")) { const c = document.createElement("code"); c.textContent = token.slice(1,-1); fragment.appendChild(c); }
    else fragment.appendChild(document.createTextNode(token));
    last = tokenRe.lastIndex;
  }
  if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
  return fragment;
}

function splitTableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function isTableSeparatorLine(line) {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s+/g, "")));
}

function renderMarkdownTable(lines, startIndex) {
  if (startIndex + 1 >= lines.length) return null;
  const headerLine = lines[startIndex].trim();
  const separatorLine = lines[startIndex + 1].trim();
  if (!headerLine.includes("|") || !separatorLine.includes("|")) return null;
  if (!isTableSeparatorLine(separatorLine)) return null;
  const headerCells = splitTableCells(headerLine);
  if (headerCells.length < 2) return null;
  let endIndex = startIndex + 2;
  while (endIndex < lines.length && lines[endIndex].trim() && lines[endIndex].trim().includes("|")) endIndex++;

  const wrap = document.createElement("div"); wrap.className = "md-table-wrap";
  const table = document.createElement("table"); table.className = "md-table";
  const thead = document.createElement("thead"); const headRow = document.createElement("tr");
  headerCells.forEach((cell) => { const th = document.createElement("th"); th.appendChild(renderInlineMarkdown(cell)); headRow.appendChild(th); });
  thead.appendChild(headRow); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (let i = startIndex + 2; i < endIndex; i++) {
    const rowCells = splitTableCells(lines[i]);
    if (!rowCells.length) continue;
    const row = document.createElement("tr");
    for (let col = 0; col < headerCells.length; col++) {
      const td = document.createElement("td"); td.appendChild(renderInlineMarkdown(rowCells[col] ?? "")); row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody); wrap.appendChild(table);
  return { node: wrap, nextIndex: endIndex };
}

function renderAssistantMarkdown(text) {
  const root = document.createElement("div"); root.className = "md-content";
  const lines = normalizeMarkdownForRendering(text).split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]; const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = Math.min(3, (trimmed.match(/^#+/)?.[0]?.length ?? 1));
      const h = document.createElement(`h${level + 1}`); h.appendChild(renderInlineMarkdown(trimmed.replace(/^#{1,3}\s+/, ""))); root.appendChild(h); i++; continue;
    }
    if (/^-\s+/.test(trimmed)) {
      const ul = document.createElement("ul");
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) { const li = document.createElement("li"); li.appendChild(renderInlineMarkdown(lines[i].trim().replace(/^-+\s+/, ""))); ul.appendChild(li); i++; }
      root.appendChild(ul); continue;
    }
    const tableBlock = renderMarkdownTable(lines, i);
    if (tableBlock) { root.appendChild(tableBlock.node); i = tableBlock.nextIndex; continue; }
    const parts = [];
    while (i < lines.length && lines[i].trim() && !/^-\s+/.test(lines[i].trim()) && !/^#{1,3}\s+/.test(lines[i].trim()) && !renderMarkdownTable(lines, i)) {
      parts.push(lines[i].trim()); i++;
    }
    const p = document.createElement("p"); p.appendChild(renderInlineMarkdown(parts.join(" "))); root.appendChild(p);
  }
  return root;
}

function renderJsonPrimitive(value) {
  const span = document.createElement("span");
  if (typeof value === "string")  { span.className = "json-value json-string";  span.textContent = `"${value}"`; }
  else if (typeof value === "number")  { span.className = "json-value json-number";  span.textContent = String(value); }
  else if (typeof value === "boolean") { span.className = "json-value json-boolean"; span.textContent = String(value); }
  else if (value === null)             { span.className = "json-value json-null";    span.textContent = "null"; }
  else { span.className = "json-value"; span.textContent = String(value); }
  return span;
}

function renderJsonTree(value, depth = 0) {
  if (value === null || typeof value !== "object") return renderJsonPrimitive(value);
  const isArr = Array.isArray(value);
  const keys = isArr ? value.map((_, i) => i) : Object.keys(value);
  const details = document.createElement("details"); details.className = "json-node"; if (depth < 2) details.open = true;
  const summary = document.createElement("summary"); summary.textContent = isArr ? `Array(${keys.length})` : `Object(${keys.length})`; details.appendChild(summary);
  const body = document.createElement("div"); body.className = "json-children";
  keys.forEach((key) => {
    const row = document.createElement("div"); row.className = "json-row";
    const k = document.createElement("span"); k.className = "json-key"; k.textContent = isArr ? `[${key}]` : key; row.appendChild(k);
    row.appendChild(renderJsonTree(isArr ? value[key] : value[key], depth + 1)); body.appendChild(row);
  });
  details.appendChild(body); return details;
}

function buildTraceSection(label, value) {
  const section = document.createElement("div"); section.className = "trace-section";
  const lbl = document.createElement("div"); lbl.className = "trace-label"; lbl.textContent = label; section.appendChild(lbl);
  const parsed = tryParsePossiblyJson(value);
  if (parsed !== null) { section.appendChild(renderJsonTree(parsed)); }
  else { const t = document.createElement("div"); t.className = "trace-text"; t.textContent = String(value ?? ""); section.appendChild(t); }
  return section;
}

function buildTraceBlock(trace = []) {
  const wrapper = document.createElement("div"); wrapper.className = "step-block";
  const title = document.createElement("div"); title.className = "step-title"; title.textContent = "Pipeline Steps"; wrapper.appendChild(title);
  if (!trace.length) { const e = document.createElement("div"); e.textContent = "No trace available."; wrapper.appendChild(e); return wrapper; }
  for (const entry of trace) {
    const row = document.createElement("div"); row.className = "step-row";
    const stage = (entry.phase || "unknown").toUpperCase();
    const h = document.createElement("div"); h.className = "trace-heading"; h.textContent = `${stage}${entry.durationMs ? ` (${entry.durationMs}ms)` : ""}`; row.appendChild(h);
    row.appendChild(buildTraceSection("Action", entry.action ?? ""));
    if (entry.reasoning) row.appendChild(buildTraceSection("Reasoning", entry.reasoning));
    wrapper.appendChild(row);
  }
  return wrapper;
}

function buildRawJsonBlock(output) {
  const wrapper = document.createElement("div"); wrapper.className = "step-block";
  const title = document.createElement("div"); title.className = "step-title"; title.textContent = "Raw JSON"; wrapper.appendChild(title);
  const pd = document.createElement("details"); pd.className = "raw-json-panel";
  const ps = document.createElement("summary"); ps.textContent = "Pipeline output payload"; pd.appendChild(ps); pd.appendChild(renderJsonTree(output ?? {})); wrapper.appendChild(pd);
  const pfr = tryParsePossiblyJson(output?.formattedResponse);
  if (pfr !== null) {
    const fd = document.createElement("details"); fd.className = "raw-json-panel";
    const fs = document.createElement("summary"); fs.textContent = "Parsed formattedResponse JSON"; fd.appendChild(fs); fd.appendChild(renderJsonTree(pfr)); wrapper.appendChild(fd);
  }
  return wrapper;
}

// ── API calls ──────────────────────────────────────────────────────────────────
async function triggerPipeline(userMessage) {
  const payload = { userMessage, brandId: getSelectedBrandId() };
  if (sessionId) payload.sessionId = sessionId;
  const res = await fetch(`${getApiBase()}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Pipeline trigger failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getStatus(runId) {
  const res = await fetch(`${getApiBase()}/status/${runId}`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function isTerminal(status) {
  return ["COMPLETED", "FAILED", "CANCELED"].includes(status);
}

async function pollUntilDone(runId) {
  let lastStatus = null;
  while (true) {
    const data = await getStatus(runId);
    if (data.status !== lastStatus) {
      addMessage("system", `Run ${runId}: ${data.status}`);
      updateLoaderText(`${data.status} (${runId})...`);
      lastStatus = data.status;
    }
    if (isTerminal(data.status)) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function autoDetectApiBase() {
  for (const base of API_CANDIDATES) {
    try {
      const res = await fetch(`${base}/health`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "ok") { apiBaseInput.value = base; addMessage("system", `Detected API base: ${base}`); return; }
    } catch { /* try next */ }
  }
  addMessage("system", "Could not auto-detect API server. Set API Base manually.");
}

async function loadBrands(options = {}) {
  const { announceFallback = true } = options;
  const preferred = getSelectedBrandId();
  try {
    const res = await fetch(`${getApiBase()}/brands`);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const payload = await res.json();
    populateBrandSelector(payload.brands, payload.defaultBrandId, preferred);
  } catch (error) {
    populateBrandSelector(FALLBACK_BRANDS, "acme-marketing", preferred);
    if (announceFallback) addMessage("system", `Brand discovery failed. Using fallback list. ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Chat send ──────────────────────────────────────────────────────────────────
async function onSend() {
  if (isRunning) return;
  const text = promptInput.value.trim();
  if (!text) return;

  isRunning = true;
  sendBtn.disabled = true;
  apiBaseInput.disabled = true;
  if (brandIdInput) brandIdInput.disabled = true;

  addMessage("user", text);
  promptInput.value = "";

  try {
    showLoader("Starting pipeline...");
    const trigger = await triggerPipeline(text);
    sessionId = trigger.sessionId;
    if (sessionInfo) sessionInfo.textContent = `Session: ${sessionId}`;
    addMessage("system", `Pipeline started (run ${trigger.runId})`);
    updateLoaderText(`Running pipeline (${trigger.runId})...`);

    const final = await pollUntilDone(trigger.runId);
    removeLoader();

    if (final.status !== "COMPLETED") { addMessage("assistant", `Run finished with status: ${final.status}`); return; }

    const output = final.output || {};
    const wrap = document.createElement("div");
    const finalText = document.createElement("div");
    finalText.appendChild(renderAssistantMarkdown(getReadableAssistantText(output)));
    wrap.appendChild(finalText);
    wrap.appendChild(buildTraceBlock(output.trace || []));
    wrap.appendChild(buildRawJsonBlock(output));
    if ((output.notifications || []).length) {
      const notif = document.createElement("div"); notif.className = "step-block";
      notif.textContent = `Notifications queued: ${output.notifications.length}`; wrap.appendChild(notif);
    }
    addMessage("assistant", wrap);
  } catch (error) {
    removeLoader();
    addMessage("assistant", `Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isRunning = false;
    sendBtn.disabled = false;
    apiBaseInput.disabled = false;
    if (brandIdInput) brandIdInput.disabled = false;
    promptInput.focus();
  }
}

// ── Knowledge Editor ───────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

const knowledgeState = {
  files: [],
  selectedPath: null,
  originalContent: null,
  dirty: false,
  collapsedFolders: new Set(),
};

function knowledgeStatus(msg) {
  const el = document.getElementById("knowledgeEditorStatus");
  if (el) el.textContent = msg;
}

function buildKnowledgeTree(files) {
  const root = { children: {} };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children[part]) node.children[part] = { name: part, type: "folder", children: {} };
      node = node.children[part];
    }
    const last = parts[parts.length - 1];
    node.children[last] = { name: f.name + ".md", type: "file", filePath: f.path };
  }
  return root;
}

const K_CHEVRON_R = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const K_CHEVRON_D = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const K_FOLDER_C  = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--warning)" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5H12.5A1.5 1.5 0 0 1 14 6v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11V4.5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/></svg>`;
const K_FOLDER_O  = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--warning)" aria-hidden="true"><path d="M2 5A1.5 1.5 0 0 1 3.5 3.5h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v1H2V5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/><path d="M2 7.5h12l-1.5 5H3.5L2 7.5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/></svg>`;
const K_FILE      = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--soft-muted)" aria-hidden="true"><path d="M4 2h5.5L12 4.5V14H4V2z" stroke="currentColor" stroke-width="1.4" fill="rgba(142,126,255,.12)"/><path d="M9.5 2v2.5H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function renderTreeNode(node, depth, folderPath) {
  const indent = depth * 12;
  let html = "";
  const sorted = Object.values(node.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of sorted) {
    if (child.type === "folder") {
      const childPath = folderPath ? `${folderPath}/${child.name}` : child.name;
      const collapsed = knowledgeState.collapsedFolders.has(childPath);
      html += `<button class="ktree-folder" data-folder="${escHtml(childPath)}" style="display:flex;align-items:center;gap:5px;width:100%;text-align:left;padding:3px 8px 3px ${indent+6}px;background:transparent;border:none;border-radius:4px;font-size:0.81rem;font-weight:500;color:var(--text);cursor:pointer;transition:background .1s" title="${escHtml(childPath)}">${collapsed ? K_CHEVRON_R : K_CHEVRON_D}${collapsed ? K_FOLDER_C : K_FOLDER_O}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(child.name)}</span></button>`;
      if (!collapsed) html += renderTreeNode(child, depth + 1, childPath);
    } else {
      const active = child.filePath === knowledgeState.selectedPath;
      html += `<button class="ktree-file${active?" active":""}" data-path="${escHtml(child.filePath)}" style="display:flex;align-items:center;gap:5px;width:100%;text-align:left;padding:3px 8px 3px ${indent+18}px;background:${active?"var(--accent-soft)":"transparent"};border:none;border-radius:4px;font-size:0.81rem;color:${active?"var(--accent-deep)":"var(--text)"};font-weight:${active?"600":"400"};cursor:pointer;transition:background .1s" title="${escHtml(child.filePath)}">${K_FILE}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(child.name)}</span></button>`;
    }
  }
  return html;
}

function renderKnowledgeFileList() {
  const container = document.getElementById("knowledgeFileList");
  if (!container) return;

  if (!knowledgeState.files.length) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;">No .md files found for this brand.</div>';
    return;
  }

  const tree = buildKnowledgeTree(knowledgeState.files);
  container.innerHTML = `<div style="padding:4px 0">${renderTreeNode(tree, 0, "")}</div>`;

  container.querySelectorAll(".ktree-folder").forEach((btn) => {
    btn.addEventListener("mouseenter", () => { btn.style.background = "var(--accent-soft)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    btn.addEventListener("click", () => {
      const fp = btn.dataset.folder;
      knowledgeState.collapsedFolders.has(fp) ? knowledgeState.collapsedFolders.delete(fp) : knowledgeState.collapsedFolders.add(fp);
      renderKnowledgeFileList();
    });
  });

  container.querySelectorAll(".ktree-file").forEach((btn) => {
    btn.addEventListener("mouseenter", () => { if (btn.dataset.path !== knowledgeState.selectedPath) { btn.style.background = "var(--accent-soft)"; btn.style.opacity = "0.7"; } });
    btn.addEventListener("mouseleave", () => { if (btn.dataset.path !== knowledgeState.selectedPath) { btn.style.background = "transparent"; btn.style.opacity = "1"; } });
    btn.addEventListener("click", () => selectKnowledgeFile(btn.dataset.path));
  });
}

async function selectKnowledgeFile(filePath) {
  if (knowledgeState.dirty && !confirm("You have unsaved changes. Discard and open a new file?")) return;

  knowledgeState.selectedPath = filePath;
  knowledgeState.dirty = false;
  renderKnowledgeFileList();

  const textarea = document.getElementById("knowledgeEditorTextarea");
  const meta     = document.getElementById("knowledgeEditorMeta");
  const saveBtn  = document.getElementById("knowledgeSaveBtn");

  textarea.disabled = true;
  textarea.value = "";
  if (saveBtn) saveBtn.disabled = true;
  if (meta) meta.innerHTML = `<span class="eyebrow subtle">Loading <code>${escHtml(filePath)}</code>…</span>`;
  knowledgeStatus("");

  try {
    const brandId = getSelectedBrandId();
    const res = await fetch(`${getApiBase()}/brands/${encodeURIComponent(brandId)}/knowledge/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    textarea.value = data.content;
    knowledgeState.originalContent = data.content;
    textarea.disabled = false;
    if (meta) meta.innerHTML = `<code style="font-size:0.8rem;color:var(--accent-deep)">${escHtml(filePath)}</code>`;
    knowledgeStatus("Loaded — edit and press Save to persist.");
  } catch (err) {
    knowledgeStatus(`Error loading file: ${err.message}`);
    if (meta) meta.innerHTML = `<span class="eyebrow subtle" style="color:var(--danger)">Failed to load</span>`;
  }
}

async function saveKnowledgeFile() {
  const filePath = knowledgeState.selectedPath;
  const textarea = document.getElementById("knowledgeEditorTextarea");
  const saveBtn  = document.getElementById("knowledgeSaveBtn");
  if (!filePath || !textarea) return;

  saveBtn.disabled = true;
  knowledgeStatus("Saving…");

  try {
    const brandId = getSelectedBrandId();
    const res = await fetch(`${getApiBase()}/brands/${encodeURIComponent(brandId)}/knowledge/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content: textarea.value }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    knowledgeState.originalContent = textarea.value;
    knowledgeState.dirty = false;
    saveBtn.disabled = true;
    knowledgeStatus("Saved successfully.");
  } catch (err) {
    knowledgeStatus(`Save failed: ${err.message}`);
    saveBtn.disabled = false;
  }
}

async function loadKnowledgeFiles() {
  const container = document.getElementById("knowledgeFileList");
  if (container) container.innerHTML = '<div class="empty-state" style="padding:1rem;">Loading…</div>';
  // Reset editor when brand changes
  knowledgeState.files = [];
  knowledgeState.selectedPath = null;
  knowledgeState.originalContent = null;
  knowledgeState.dirty = false;
  knowledgeState.collapsedFolders.clear();

  const textarea = document.getElementById("knowledgeEditorTextarea");
  const meta     = document.getElementById("knowledgeEditorMeta");
  const saveBtn  = document.getElementById("knowledgeSaveBtn");
  if (textarea) { textarea.value = ""; textarea.disabled = true; }
  if (meta) meta.innerHTML = `<span class="eyebrow subtle">No file selected</span>`;
  if (saveBtn) saveBtn.disabled = true;
  knowledgeStatus("");

  try {
    const brandId = getSelectedBrandId();
    const res = await fetch(`${getApiBase()}/brands/${encodeURIComponent(brandId)}/knowledge/files`);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    knowledgeState.files = data.files || [];
    renderKnowledgeFileList();
  } catch (err) {
    if (container) container.innerHTML = `<div class="empty-state" style="padding:1rem;color:var(--danger)">Error: ${escHtml(err.message)}</div>`;
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", onSend);
promptInput.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSend(); });

brandIdInput?.addEventListener("change", () => {
  const brand = getSelectedBrandMeta();
  updateBrandDescription();
  const chatTitle = document.getElementById("chatPageTitle");
  const knowledgeTitle = document.getElementById("knowledgePageTitle");
  if (chatTitle) chatTitle.textContent = `${brand?.name || getSelectedBrandId()} — Chat`;
  if (knowledgeTitle) knowledgeTitle.textContent = `${brand?.name || getSelectedBrandId()} — Knowledge`;
  resetSessionState(`Switched to ${brand?.name || getSelectedBrandId()}. Started a new session.`);
  loadKnowledgeFiles();
});

apiBaseInput?.addEventListener("change", () => { loadBrands(); loadKnowledgeFiles(); });

document.getElementById("knowledgeSaveBtn")?.addEventListener("click", saveKnowledgeFile);

document.getElementById("knowledgeEditorTextarea")?.addEventListener("input", () => {
  const saveBtn = document.getElementById("knowledgeSaveBtn");
  const textarea = document.getElementById("knowledgeEditorTextarea");
  const isDirty = textarea.value !== knowledgeState.originalContent;
  knowledgeState.dirty = isDirty;
  if (saveBtn) saveBtn.disabled = !isDirty;
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────
addMessage("system", "Ready. Ask a marketing question.\nTip: use Ctrl+Enter (Cmd+Enter on Mac) to send.");
syncPageFromHash();
await autoDetectApiBase();
await loadBrands({ announceFallback: false });
await loadKnowledgeFiles();
