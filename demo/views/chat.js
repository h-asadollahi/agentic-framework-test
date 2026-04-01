// ── Chat view ──────────────────────────────────────────────────────────────────
// Owns all chat state, rendering, and event listeners.
// Exported interface: mount(outlet, ctx) / unmount() / onBrandChange()

let _ctx = null;
let _sessionId = null;
let _isRunning = false;
let _loaderEl = null;
let _chatLog = null;

// ── Loader ────────────────────────────────────────────────────────────────────
function showLoader(text) {
  removeLoader();
  _loaderEl = document.createElement("div");
  _loaderEl.className = "pipeline-loader";
  _loaderEl.innerHTML = `<div class="spinner"></div><span class="loader-text">${text}</span>`;
  _chatLog.appendChild(_loaderEl);
  _chatLog.scrollTop = _chatLog.scrollHeight;
}
function updateLoaderText(text) { if (_loaderEl) _loaderEl.querySelector(".loader-text").textContent = text; }
function removeLoader() { if (_loaderEl) { _loaderEl.remove(); _loaderEl = null; } }

// ── Messages ──────────────────────────────────────────────────────────────────
function nowStamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function addMessage(role, body) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const head = document.createElement("div"); head.className = "message-head";
  const roleEl = document.createElement("span"); roleEl.className = "role"; roleEl.textContent = role.toUpperCase();
  const stamp = document.createElement("span"); stamp.className = "stamp"; stamp.textContent = nowStamp();
  head.appendChild(roleEl); head.appendChild(stamp);

  const bodyEl = document.createElement("div"); bodyEl.className = "message-body";
  if (typeof body === "string") bodyEl.textContent = body;
  else bodyEl.appendChild(body);

  article.appendChild(head); article.appendChild(bodyEl);
  _chatLog.appendChild(article);
  _chatLog.scrollTop = _chatLog.scrollHeight;
}

function resetSession(message) {
  _sessionId = null;
  const si = document.getElementById("chat-session-info");
  if (si) si.textContent = "Session: not started";
  removeLoader();
  _chatLog.innerHTML = "";
  addMessage("system", message);
}

// ── Markdown / JSON rendering ─────────────────────────────────────────────────
function tryParseJson(value) {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value.trim()); } catch { return null; }
}
function extractJsonFromFence(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m ? tryParseJson(m[1]) : null;
}
function tryParsePossiblyJson(value) {
  return typeof value === "string" ? (tryParseJson(value) || extractJsonFromFence(value)) : null;
}
function normalizeMarkdown(text) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n").map((line) => {
    const t = line.trim();
    return /^[-*]\s+\|.+\|\s*$/.test(t) ? line.replace(/^(\s*)[-*]\s+(\|.+\|\s*)$/, "$1$2") : line;
  }).join("\n");
}
function getReadableText(output) {
  const raw = output?.formattedResponse;
  if (typeof raw !== "string") return "No formatted response was returned.";
  const d = tryParseJson(raw); if (d && typeof d.formattedResponse === "string") return d.formattedResponse;
  const f = extractJsonFromFence(raw); if (f && typeof f.formattedResponse === "string") return f.formattedResponse;
  return raw;
}
function renderInline(text) {
  const frag = document.createDocumentFragment();
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("**")) { const s = document.createElement("strong"); s.textContent = tok.slice(2,-2); frag.appendChild(s); }
    else { const c = document.createElement("code"); c.textContent = tok.slice(1,-1); frag.appendChild(c); }
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}
function splitCells(line) { return line.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map((c)=>c.trim()); }
function isSepLine(line) { const c = splitCells(line); return c.length > 0 && c.every((x)=>/^:?-{3,}:?$/.test(x.replace(/\s+/g,""))); }
function renderTable(lines, i) {
  if (i+1 >= lines.length) return null;
  const h = lines[i].trim(), s = lines[i+1].trim();
  if (!h.includes("|") || !s.includes("|") || !isSepLine(s)) return null;
  const hc = splitCells(h); if (hc.length < 2) return null;
  let end = i+2; while (end < lines.length && lines[end].trim() && lines[end].includes("|")) end++;
  const wrap = document.createElement("div"); wrap.className = "md-table-wrap";
  const tbl = document.createElement("table"); tbl.className = "md-table";
  const thead = document.createElement("thead"); const hr = document.createElement("tr");
  hc.forEach((c)=>{ const th=document.createElement("th"); th.appendChild(renderInline(c)); hr.appendChild(th); });
  thead.appendChild(hr); tbl.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (let r=i+2;r<end;r++) { const rc=splitCells(lines[r]); if(!rc.length) continue; const row=document.createElement("tr"); for(let col=0;col<hc.length;col++){const td=document.createElement("td");td.appendChild(renderInline(rc[col]??"")); row.appendChild(td);} tbody.appendChild(row); }
  tbl.appendChild(tbody); wrap.appendChild(tbl);
  return { node: wrap, nextIndex: end };
}
function renderMarkdown(text) {
  const root = document.createElement("div"); root.className = "md-content";
  const lines = normalizeMarkdown(text).split("\n"); let i = 0;
  while (i < lines.length) {
    const line = lines[i]; const t = line.trim();
    if (!t) { i++; continue; }
    if (/^#{1,3}\s+/.test(t)) { const lv=Math.min(3,(t.match(/^#+/)?.[0]?.length??1)); const h=document.createElement(`h${lv+1}`); h.appendChild(renderInline(t.replace(/^#{1,3}\s+/,""))); root.appendChild(h); i++; continue; }
    if (/^-\s+/.test(t)) { const ul=document.createElement("ul"); while(i<lines.length&&/^-\s+/.test(lines[i].trim())){const li=document.createElement("li");li.appendChild(renderInline(lines[i].trim().replace(/^-+\s+/,"")));ul.appendChild(li);i++;} root.appendChild(ul); continue; }
    const tb = renderTable(lines, i); if (tb) { root.appendChild(tb.node); i=tb.nextIndex; continue; }
    const parts=[]; while(i<lines.length&&lines[i].trim()&&!/^-\s+/.test(lines[i].trim())&&!/^#{1,3}\s+/.test(lines[i].trim())&&!renderTable(lines,i)){parts.push(lines[i].trim());i++;}
    const p=document.createElement("p"); p.appendChild(renderInline(parts.join(" "))); root.appendChild(p);
  }
  return root;
}
function renderJsonPrimitive(v) {
  const s=document.createElement("span");
  if(typeof v==="string") {s.className="json-value json-string";s.textContent=`"${v}"`;}
  else if(typeof v==="number") {s.className="json-value json-number";s.textContent=String(v);}
  else if(typeof v==="boolean"){s.className="json-value json-boolean";s.textContent=String(v);}
  else if(v===null){s.className="json-value json-null";s.textContent="null";}
  else{s.className="json-value";s.textContent=String(v);}
  return s;
}
function renderJsonTree(value, depth=0) {
  if (value===null||typeof value!=="object") return renderJsonPrimitive(value);
  const isArr=Array.isArray(value); const keys=isArr?value.map((_,i)=>i):Object.keys(value);
  const det=document.createElement("details"); det.className="json-node"; if(depth<2)det.open=true;
  const sum=document.createElement("summary"); sum.textContent=isArr?`Array(${keys.length})`:`Object(${keys.length})`; det.appendChild(sum);
  const body=document.createElement("div"); body.className="json-children";
  keys.forEach((k)=>{const row=document.createElement("div");row.className="json-row";const kEl=document.createElement("span");kEl.className="json-key";kEl.textContent=isArr?`[${k}]`:k;row.appendChild(kEl);row.appendChild(renderJsonTree(isArr?value[k]:value[k],depth+1));body.appendChild(row);});
  det.appendChild(body); return det;
}
function buildTraceBlock(trace=[]) {
  const wrap=document.createElement("div");wrap.className="step-block";
  const title=document.createElement("div");title.className="step-title";title.textContent="Pipeline Steps";wrap.appendChild(title);
  if(!trace.length){const e=document.createElement("div");e.textContent="No trace available.";wrap.appendChild(e);return wrap;}
  for(const entry of trace){
    const row=document.createElement("div");row.className="step-row";
    const h=document.createElement("div");h.className="trace-heading";h.textContent=`${(entry.phase||"unknown").toUpperCase()}${entry.durationMs?` (${entry.durationMs}ms)`:""}`;row.appendChild(h);
    const sec=(lbl,val)=>{const s=document.createElement("div");s.className="trace-section";const l=document.createElement("div");l.className="trace-label";l.textContent=lbl;s.appendChild(l);const p=tryParsePossiblyJson(val);if(p!==null)s.appendChild(renderJsonTree(p));else{const t=document.createElement("div");t.className="trace-text";t.textContent=String(val??"");s.appendChild(t);}return s;};
    row.appendChild(sec("Action",entry.action??""));
    if(entry.reasoning)row.appendChild(sec("Reasoning",entry.reasoning));
    wrap.appendChild(row);
  }
  return wrap;
}
function buildRawJsonBlock(output) {
  const wrap=document.createElement("div");wrap.className="step-block";
  const title=document.createElement("div");title.className="step-title";title.textContent="Raw JSON";wrap.appendChild(title);
  const pd=document.createElement("details");pd.className="raw-json-panel";const ps=document.createElement("summary");ps.textContent="Pipeline output payload";pd.appendChild(ps);pd.appendChild(renderJsonTree(output??{}));wrap.appendChild(pd);
  const pfr=tryParsePossiblyJson(output?.formattedResponse);
  if(pfr!==null){const fd=document.createElement("details");fd.className="raw-json-panel";const fs=document.createElement("summary");fs.textContent="Parsed formattedResponse JSON";fd.appendChild(fs);fd.appendChild(renderJsonTree(pfr));wrap.appendChild(fd);}
  return wrap;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function triggerPipeline(userMessage) {
  const payload = { userMessage, brandId: _ctx.getSelectedBrandId() };
  if (_sessionId) payload.sessionId = _sessionId;
  const res = await fetch(`${_ctx.getApiBase()}/message`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Pipeline trigger failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function pollUntilDone(runId) {
  let last = null;
  while (true) {
    const res = await fetch(`${_ctx.getApiBase()}/status/${runId}`);
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    const data = await res.json();
    if (data.status !== last) { addMessage("system", `Run ${runId}: ${data.status}`); updateLoaderText(`${data.status}...`); last = data.status; }
    if (["COMPLETED","FAILED","CANCELED"].includes(data.status)) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function onSend() {
  if (_isRunning) return;
  const input = document.getElementById("chat-prompt");
  const text = input?.value.trim();
  if (!text) return;

  _isRunning = true;
  document.getElementById("chat-send-btn").disabled = true;
  addMessage("user", text);
  input.value = "";

  try {
    showLoader("Starting pipeline...");
    const trigger = await triggerPipeline(text);
    _sessionId = trigger.sessionId;
    const si = document.getElementById("chat-session-info");
    if (si) si.textContent = `Session: ${_sessionId}`;
    addMessage("system", `Pipeline started (run ${trigger.runId})`);
    updateLoaderText(`Running (${trigger.runId})...`);

    const final = await pollUntilDone(trigger.runId);
    removeLoader();

    if (final.status !== "COMPLETED") { addMessage("assistant", `Run finished with status: ${final.status}`); return; }

    const output = final.output || {};
    const wrap = document.createElement("div");
    const text2 = document.createElement("div"); text2.appendChild(renderMarkdown(getReadableText(output))); wrap.appendChild(text2);
    wrap.appendChild(buildTraceBlock(output.trace || []));
    wrap.appendChild(buildRawJsonBlock(output));
    if ((output.notifications || []).length) { const n=document.createElement("div");n.className="step-block";n.textContent=`Notifications queued: ${output.notifications.length}`;wrap.appendChild(n); }
    addMessage("assistant", wrap);
  } catch (err) {
    removeLoader();
    addMessage("assistant", `Error: ${err.message}`);
  } finally {
    _isRunning = false;
    document.getElementById("chat-send-btn").disabled = false;
    document.getElementById("chat-prompt")?.focus();
  }
}

// ── View lifecycle ────────────────────────────────────────────────────────────
export function mount(outlet, ctx) {
  _ctx = ctx;
  _sessionId = null;
  _isRunning = false;

  const brand = ctx.getSelectedBrandMeta();
  outlet.innerHTML = `
    <section class="page">
      <section class="surface-card page-header-card">
        <div class="page-head">
          <div>
            <p class="eyebrow subtle">Chat</p>
            <h2>${brand?.name || "Brand"} — Marketing Assistant</h2>
            <p>Ask questions, generate campaign ideas, or explore your brand strategy.</p>
          </div>
          <span id="chat-session-info" class="mini-pill">Session: not started</span>
        </div>
      </section>
      <section class="surface-card chat-card">
        <div id="chat-log" class="chat-log"></div>
        <div class="composer">
          <textarea id="chat-prompt" rows="3" placeholder="Ask a marketing question… (Cmd+Enter to send)"></textarea>
          <div class="composer-actions">
            <button id="chat-send-btn" class="btn-primary" type="button">Send</button>
          </div>
        </div>
      </section>
    </section>`;

  _chatLog = document.getElementById("chat-log");

  addMessage("system", "Ready. Ask a marketing question.\nTip: use Ctrl+Enter (Cmd+Enter on Mac) to send.");

  document.getElementById("chat-send-btn").addEventListener("click", onSend);
  document.getElementById("chat-prompt").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSend();
  });
}

export function unmount() {
  _loaderEl = null;
  _chatLog = null;
  _isRunning = false;
}

export function onBrandChange() {
  const brand = _ctx?.getSelectedBrandMeta();
  resetSession(`Switched to ${brand?.name || _ctx?.getSelectedBrandId()}. Started a new session.`);
  // Update heading
  const h2 = document.querySelector("#view-outlet h2");
  if (h2) h2.textContent = `${brand?.name || "Brand"} — Marketing Assistant`;
}
