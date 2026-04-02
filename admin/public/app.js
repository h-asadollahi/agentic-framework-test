const $ = (id) => document.getElementById(id);

const state = {
  currentPage: "dashboard",
  selectedRouteId: null,
  routes: [],
  routeCache: new Map(),
  health: null,
  config: null,
  brands: [],
  events: [],
  runSummary: null,
  slackSummary: null,
  slackMessages: [],
  audit: {
    summary: null,
    runs: [],
    total: 0,
    selectedPipelineRunId: null,
    selectedRun: null,
    selectedEvents: [],
    selectedNodeId: null,
    currentTree: null,
    modalSelectedNodeId: null,
    modalCurrentTree: null,
  },
  llmUsageSummary: null,
  tokenUsage: {
    summary: null,
    prompts: [],
    total: 0,
    offset: 0,
    limit: 20,
  },
  adminChat: {
    sessionId: window.sessionStorage.getItem("admin-chat-session-id") || null,
    runId: null,
    loading: false,
    messages: [],
  },
};

const pageConfig = {
  "#dashboard": {
    page: "dashboard",
    scrollTarget: "dashboard",
    navHash: "#dashboard",
  },
  "#admin-chat": {
    page: "adminChat",
    scrollTarget: "adminChatPage",
    navHash: "#admin-chat",
  },
  "#token-usage": {
    page: "tokenUsage",
    scrollTarget: "tokenUsagePage",
    navHash: "#token-usage",
  },
  "#learned-routes": {
    page: "routes",
    scrollTarget: "routesPage",
    navHash: "#learned-routes",
  },
  "#routes-section": {
    page: "routes",
    scrollTarget: "routes-section",
    navHash: "#learned-routes",
  },
  "#details-section": {
    page: "routes",
    scrollTarget: "routes-section",
    navHash: "#learned-routes",
  },
  "#activity-feed": {
    page: "activity",
    scrollTarget: "activityPage",
    navHash: "#activity-feed",
  },
  "#activity-section": {
    page: "activity",
    scrollTarget: "activity-section",
    navHash: "#activity-feed",
  },
  "#run-watch": {
    page: "runs",
    scrollTarget: "runsPage",
    navHash: "#run-watch",
  },
  "#audit-trail": {
    page: "audit",
    scrollTarget: "auditPage",
    navHash: "#audit-trail",
  },
  "#runs-section": {
    page: "runs",
    scrollTarget: "runs-section",
    navHash: "#run-watch",
  },
  "#slack-hitl": {
    page: "slack",
    scrollTarget: "slackPage",
    navHash: "#slack-hitl",
  },
  "#knowledge-editor": {
    page: "knowledge",
    scrollTarget: "knowledgeEditorPage",
    navHash: "#knowledge-editor",
  },
};

function setText(id, value) {
  const element = $(id);
  if (element) {
    element.textContent = value;
  }
}

function status(text) {
  const badge = $("status");
  if (!badge) return;

  const lower = String(text || "").toLowerCase();
  let tone = "neutral";
  if (
    lower.includes("loading") ||
    lower.includes("refresh") ||
    lower.includes("exporting") ||
    lower.includes("backfill")
  ) {
    tone = "loading";
  } else if (lower.includes("failed") || lower.includes("error")) {
    tone = "error";
  } else if (
    lower.includes("loaded") ||
    lower.includes("imported") ||
    lower.includes("exported") ||
    lower.includes("deleted")
  ) {
    tone = "ready";
  }

  badge.textContent = text;
  badge.dataset.tone = tone;
}

function setAuthState(config) {
  const authState = $("authState");
  if (!authState) return;

  authState.textContent = config?.authDescription || "Server auth unavailable";
  authState.className = "auth-state";
  if (config?.authMode === "env-token") {
    authState.classList.add("ready");
    return;
  }
  authState.classList.add("warn");
}

function pageRoute(hash) {
  return pageConfig[hash] || pageConfig["#dashboard"];
}

function setActiveNav(hash) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
}

function setActivePage(page) {
  state.currentPage = page;
  const pageIds = {
    dashboard: "dashboardPage",
    adminChat: "adminChatPage",
    tokenUsage: "tokenUsagePage",
    routes: "routesPage",
    activity: "activityPage",
    runs: "runsPage",
    audit: "auditPage",
    slack: "slackPage",
    knowledge: "knowledgeEditorPage",
  };

  Object.entries(pageIds).forEach(([pageName, elementId]) => {
    const element = $(elementId);
    if (element) {
      element.hidden = page !== pageName;
    }
  });
}

function syncPageFromHash(options = {}) {
  const hash = window.location.hash || "#dashboard";
  const route = pageRoute(hash);
  setActivePage(route.page);
  setActiveNav(route.navHash || hash);

  if (!options.scroll) return;

  const target = $(route.scrollTarget);
  if (!target) return;

  target.scrollIntoView({
    behavior: options.instant ? "auto" : "smooth",
    block: "start",
  });
}

function openRouteModal() {
  const modal = $("routeModal");
  if (!modal) return;
  modal.hidden = false;
  syncModalOpenState();
}

function closeRouteModal() {
  const modal = $("routeModal");
  if (!modal) return;
  modal.hidden = true;
  syncModalOpenState();
}

function openAuditModal() {
  const modal = $("auditRunModal");
  if (!modal) return;
  modal.hidden = false;
  syncModalOpenState();
}

function closeAuditModal() {
  const modal = $("auditRunModal");
  if (!modal) return;
  modal.hidden = true;
  syncModalOpenState();
}

function syncModalOpenState() {
  const hasOpenModal =
    ($("routeModal") && !$("routeModal").hidden) ||
    ($("auditRunModal") && !$("auditRunModal").hidden);
  document.body.classList.toggle("modal-open", Boolean(hasOpenModal));
}

function auditViewConfig(mode = "inline") {
  return mode === "modal"
    ? {
        containerId: "auditModalTreeContainer",
        detailId: "auditModalDetailPanel",
        selectionKey: "modalSelectedNodeId",
        treeKey: "modalCurrentTree",
      }
    : {
        containerId: "auditTreeContainer",
        detailId: "auditDetailPanel",
        selectionKey: "selectedNodeId",
        treeKey: "currentTree",
      };
}

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  const apiBase = $("apiBase")?.value.trim().replace(/\/$/, "");
  if (apiBase) {
    headers["x-admin-api-base"] = apiBase;
  }
  return headers;
}

async function api(path, options = {}) {
  const res = await fetch(`/_admin_proxy${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function loadUiConfig() {
  const res = await fetch("/admin-ui-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
  }

  state.config = data;
  if (data?.defaultApiBase && $("apiBase")) {
    $("apiBase").value = data.defaultApiBase;
  }
  setAuthState(data);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tryParseStructuredJsonString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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
  const normalizedLines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^[-*]\s+\|.+\|\s*$/.test(trimmed)) {
        return line.replace(/^(\s*)[-*]\s+(\|.+\|\s*)$/, "$1$2");
      }
      return line;
    });

  return normalizedLines.join("\n");
}

function getReadableAssistantText(output) {
  const raw = output?.formattedResponse;
  if (typeof raw !== "string") {
    return "No formatted response was returned.";
  }

  const fromDirectJson = tryParseJsonString(raw);
  if (fromDirectJson && typeof fromDirectJson.formattedResponse === "string") {
    return fromDirectJson.formattedResponse;
  }

  const fromFencedJson = extractJsonFromFencedBlock(raw);
  if (fromFencedJson && typeof fromFencedJson.formattedResponse === "string") {
    return fromFencedJson.formattedResponse;
  }

  return raw;
}

function renderInlineMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > last) {
      fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      fragment.appendChild(strong);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      fragment.appendChild(code);
    } else {
      fragment.appendChild(document.createTextNode(token));
    }

    last = tokenRe.lastIndex;
  }

  if (last < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(last)));
  }

  return fragment;
}

function splitTableCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparatorLine(line) {
  const cells = splitTableCells(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
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
  while (endIndex < lines.length) {
    const rowLine = lines[endIndex].trim();
    if (!rowLine || !rowLine.includes("|")) break;
    endIndex += 1;
  }

  const wrap = document.createElement("div");
  wrap.className = "table-shell";

  const table = document.createElement("table");
  table.className = "route-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headerCells.forEach((cell) => {
    const th = document.createElement("th");
    th.appendChild(renderInlineMarkdown(cell));
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = startIndex + 2; i < endIndex; i += 1) {
    const rowCells = splitTableCells(lines[i]);
    const row = document.createElement("tr");
    for (let col = 0; col < headerCells.length; col += 1) {
      const td = document.createElement("td");
      td.appendChild(renderInlineMarkdown(rowCells[col] ?? ""));
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  return { node: wrap, nextIndex: endIndex };
}

function renderAssistantMarkdown(text) {
  const root = document.createElement("div");
  root.className = "chat-content";

  const lines = normalizeMarkdownForRendering(text).split("\n");
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = Math.min(3, trimmed.match(/^#+/)?.[0]?.length ?? 1);
      const heading = document.createElement(`h${level + 1}`);
      heading.appendChild(renderInlineMarkdown(trimmed.replace(/^#{1,3}\s+/, "")));
      root.appendChild(heading);
      index += 1;
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const list = document.createElement("ul");
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        const item = document.createElement("li");
        item.appendChild(renderInlineMarkdown(lines[index].trim().replace(/^-+\s+/, "")));
        list.appendChild(item);
        index += 1;
      }
      root.appendChild(list);
      continue;
    }

    const tableBlock = renderMarkdownTable(lines, index);
    if (tableBlock) {
      root.appendChild(tableBlock.node);
      index = tableBlock.nextIndex;
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^-\s+/.test(lines[index].trim()) &&
      !/^#{1,3}\s+/.test(lines[index].trim()) &&
      !renderMarkdownTable(lines, index)
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    const paragraph = document.createElement("p");
    paragraph.appendChild(renderInlineMarkdown(paragraphLines.join(" ")));
    root.appendChild(paragraph);
  }

  return root;
}

function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tryParseJsonString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function formatTextStats(value) {
  const lines = String(value || "").split(/\r?\n/).length;
  const chars = String(value || "").length;
  return `${humanizeCount(lines)} lines · ${humanizeCount(chars)} chars`;
}

function looksLikeCodeishText(key, value) {
  if (typeof value !== "string") return false;
  const lowerKey = String(key || "").toLowerCase();
  if (
    lowerKey.includes("id") ||
    lowerKey.includes("source") ||
    lowerKey.includes("path") ||
    lowerKey.includes("model") ||
    lowerKey.includes("route") ||
    lowerKey.includes("recipient")
  ) {
    return true;
  }

  return /[/_.:-]/.test(value) && value.length < 140 && !/\s{2,}/.test(value);
}

function renderInlineScalar(value, key = "") {
  if (value === null) {
    const el = document.createElement("span");
    el.className = "payload-empty";
    el.textContent = "null";
    return el;
  }

  if (value === undefined) {
    const el = document.createElement("span");
    el.className = "payload-empty";
    el.textContent = "undefined";
    return el;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    const el = document.createElement("code");
    el.className = "payload-inline-code";
    el.textContent = String(value);
    return el;
  }

  if (looksLikeCodeishText(key, value)) {
    const el = document.createElement("code");
    el.className = "payload-inline-code";
    el.textContent = String(value);
    return el;
  }

  const el = document.createElement("span");
  el.className = "payload-inline";
  el.textContent = String(value);
  return el;
}

function renderTextBlock(value, options = {}) {
  const text = String(value ?? "");
  const details = document.createElement("details");
  details.className = "payload-block";

  if (options.depth <= 0 || text.length < 600) {
    details.open = true;
  }

  const summary = document.createElement("summary");
  summary.textContent = options.summaryLabel || "Text";

  const meta = document.createElement("span");
  meta.className = "payload-block-meta";
  meta.textContent = formatTextStats(text);
  summary.appendChild(meta);

  const pre = document.createElement("pre");
  pre.className = "payload-text";
  pre.textContent = text;

  details.appendChild(summary);
  details.appendChild(pre);
  return details;
}

function renderTextPreviewObject(value, depth) {
  const wrapper = document.createElement("div");
  wrapper.className = "payload-object";

  const metaRow = document.createElement("div");
  metaRow.className = "payload-meta-row";

  const typeChip = document.createElement("span");
  typeChip.className = "payload-badge";
  typeChip.textContent = humanizeToken(value.type || "text-preview");
  metaRow.appendChild(typeChip);

  if (value.truncated) {
    const truncatedChip = document.createElement("span");
    truncatedChip.className = "payload-badge warning";
    truncatedChip.textContent = `Truncated · ${humanizeCount(value.originalLength || 0)} chars`;
    metaRow.appendChild(truncatedChip);
  }

  wrapper.appendChild(metaRow);
  wrapper.appendChild(
    renderTextBlock(value.preview || "", {
      depth,
      summaryLabel: "Preview",
    })
  );
  return wrapper;
}

function renderPayloadField(key, value, depth = 0) {
  const row = document.createElement("div");
  row.className = "payload-field";

  const label = document.createElement("div");
  label.className = "payload-key";
  label.textContent = humanizeToken(key);

  const content = document.createElement("div");
  content.className = "payload-value";
  content.appendChild(renderPayloadValue(value, { key, depth }));

  row.appendChild(label);
  row.appendChild(content);
  return row;
}

function renderPrimitiveArray(values) {
  const wrapper = document.createElement("div");
  wrapper.className = "chip-list";
  values.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = String(value);
    wrapper.appendChild(chip);
  });
  return wrapper;
}

function renderArrayValue(values, depth = 0) {
  if (values.length === 0) {
    const empty = document.createElement("span");
    empty.className = "payload-empty";
    empty.textContent = "Empty array";
    return empty;
  }

  const primitiveArray = values.every(
    (item) =>
      item === null ||
      item === undefined ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
  );

  if (primitiveArray && values.every((item) => String(item ?? "").length < 72)) {
    return renderPrimitiveArray(values);
  }

  const details = document.createElement("details");
  details.className = "payload-block";
  details.open = depth <= 0;

  const summary = document.createElement("summary");
  summary.textContent = `Array`;

  const meta = document.createElement("span");
  meta.className = "payload-block-meta";
  meta.textContent = `${humanizeCount(values.length)} items`;
  summary.appendChild(meta);
  details.appendChild(summary);

  const list = document.createElement("div");
  list.className = "payload-array-items";

  values.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "payload-array-item";

    const indexLabel = document.createElement("div");
    indexLabel.className = "payload-array-index";
    indexLabel.textContent = `Item ${index + 1}`;

    const valueWrap = document.createElement("div");
    valueWrap.className = "payload-array-value";
    valueWrap.appendChild(renderPayloadValue(item, { depth: depth + 1 }));

    row.appendChild(indexLabel);
    row.appendChild(valueWrap);
    list.appendChild(row);
  });

  details.appendChild(list);
  return details;
}

function renderObjectValue(value, depth = 0) {
  const entries = Object.entries(value || {});
  if (entries.length === 0) {
    const empty = document.createElement("span");
    empty.className = "payload-empty";
    empty.textContent = "Empty object";
    return empty;
  }

  if (value.type === "text-preview" && typeof value.preview === "string") {
    return renderTextPreviewObject(value, depth);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "payload-fields";
  entries.forEach(([key, entry]) => {
    wrapper.appendChild(renderPayloadField(key, entry, depth + 1));
  });
  return wrapper;
}

function renderPayloadValue(value, options = {}) {
  const depth = options.depth || 0;
  const key = options.key || "";

  if (Array.isArray(value)) {
    return renderArrayValue(value, depth);
  }

  if (isPlainObject(value)) {
    return renderObjectValue(value, depth);
  }

  const parsedJson = tryParseStructuredJsonString(value);
  if (parsedJson !== null) {
    const details = document.createElement("details");
    details.className = "payload-block";
    details.open = depth <= 0;

    const summary = document.createElement("summary");
    summary.textContent = "Structured JSON String";

    const meta = document.createElement("span");
    meta.className = "payload-block-meta";
    meta.textContent = formatTextStats(String(value));
    summary.appendChild(meta);

    details.appendChild(summary);
    details.appendChild(renderPayloadValue(parsedJson, { depth: depth + 1 }));
    return details;
  }

  if (typeof value === "string" && (value.includes("\n") || value.length > 140)) {
    return renderTextBlock(value, {
      depth,
      summaryLabel: key ? humanizeToken(key) : "Text",
    });
  }

  return renderInlineScalar(value, key);
}

function renderAuditPayloadInspector(payload) {
  const root = document.createElement("div");
  root.className = "audit-payload-shell";

  if (!payload || (isPlainObject(payload) && Object.keys(payload).length === 0)) {
    const empty = document.createElement("div");
    empty.className = "payload-empty";
    empty.textContent = "No payload recorded.";
    root.appendChild(empty);
    return root;
  }

  const structured = document.createElement("div");
  structured.className = "payload-inspector";
  structured.appendChild(renderPayloadValue(payload, { depth: 0 }));
  root.appendChild(structured);

  const raw = document.createElement("details");
  raw.className = "raw-json";

  const summary = document.createElement("summary");
  summary.textContent = "Raw JSON";
  raw.appendChild(summary);

  const pre = document.createElement("pre");
  pre.textContent = prettyJson(payload);
  raw.appendChild(pre);

  root.appendChild(raw);
  return root;
}

function formatTimestamp(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function humanizeToken(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRouteTarget(route) {
  return route.routeType === "api" ? route.endpoint?.url || "-" : route.agentId || "-";
}

function getRouteWorkflow(route) {
  return route.apiWorkflow?.workflowType || (route.routeType === "sub-agent" ? "sub-agent" : "-");
}

function summarizePatterns(route) {
  const patterns = Array.isArray(route.matchPatterns) ? route.matchPatterns : [];
  if (patterns.length === 0) return "-";
  const preview = patterns.slice(0, 3).join(", ");
  return patterns.length > 3 ? `${preview} +${patterns.length - 3}` : preview;
}

function setMetric(id, value) {
  setText(id, value);
}

function renderHealth(payload) {
  const stats = payload?.stats || {};
  const dbBacked = Boolean(payload?.dbBacked);
  const badge = $("sourceBadge");

  if (badge) {
    badge.textContent = dbBacked ? "DB-backed" : "JSON fallback";
    badge.className = `source-pill ${dbBacked ? "db" : "json"}`;
  }

  setMetric("totalRoutes", String(stats.total ?? 0));
  setMetric("apiRoutes", String(stats.apiRoutes ?? 0));
  setMetric("subAgentRoutes", String(stats.subAgentRoutes ?? 0));
  setMetric("dualWriteState", stats.dualWriteJson ? "On" : "Off");

  setText(
    "sourceMeta",
    dbBacked
      ? "Live learned routes are currently being served from Postgres through the admin API."
      : "Admin API is currently using the JSON fallback for learned routes."
  );
}

function renderRouteDetails(route) {
  const summary = $("routeDetailSummary");
  const raw = $("routeRaw");

  if (!summary || !raw) return;

  if (!route) {
    setText("selectedRouteTitle", "Route Details");
    setText(
      "selectedRouteMeta",
      "Select a route from the explorer to inspect definition, targeting, and usage context."
    );
    setText("selectedRoutePill", "No route selected");
    summary.className = "empty-state";
    summary.innerHTML =
      "Select a route from the table to inspect the current DB-backed definition.";
    raw.textContent = "No route selected.";
    return;
  }

  const patterns = Array.isArray(route.matchPatterns) ? route.matchPatterns : [];
  const inputMappingKeys = Object.keys(route.inputMapping || {});
  const agentDefaultKeys = Object.keys(route.agentInputDefaults || {});
  const sourceLabel = state.health?.dbBacked ? "Postgres (active source)" : "JSON fallback";

  setText("selectedRouteTitle", route.capability || "Route Details");
  setText(
    "selectedRouteMeta",
    route.description || "Inspecting the selected learned route definition."
  );
  setText("selectedRoutePill", route.id || "Selected route");

  summary.className = "detail-grid";
  summary.innerHTML = `
    <div class="detail-card">
      <h4>Identity</h4>
      <dl>
        <dt>ID</dt>
        <dd>${escapeHtml(route.id)}</dd>
        <dt>Capability</dt>
        <dd>${escapeHtml(route.capability)}</dd>
        <dt>Type</dt>
        <dd>${escapeHtml(route.routeType)}</dd>
        <dt>Workflow</dt>
        <dd>${escapeHtml(getRouteWorkflow(route))}</dd>
      </dl>
    </div>
    <div class="detail-card">
      <h4>Target</h4>
      <dl>
        <dt>Target</dt>
        <dd><pre>${escapeHtml(getRouteTarget(route))}</pre></dd>
        <dt>Output</dt>
        <dd>${escapeHtml(route.outputFormat || "-")}</dd>
        <dt>Added By</dt>
        <dd>${escapeHtml(route.addedBy || "-")}</dd>
        <dt>Source</dt>
        <dd>${escapeHtml(sourceLabel)}</dd>
      </dl>
    </div>
    <div class="detail-card">
      <h4>Usage</h4>
      <dl>
        <dt>Usage Count</dt>
        <dd>${escapeHtml(String(route.usageCount ?? 0))}</dd>
        <dt>Last Used</dt>
        <dd>${escapeHtml(formatTimestamp(route.lastUsedAt))}</dd>
        <dt>Added At</dt>
        <dd>${escapeHtml(formatTimestamp(route.addedAt))}</dd>
        <dt>Updated Via</dt>
        <dd>${escapeHtml(
          route.routeType === "api" ? "Endpoint/API workflow" : "Sub-agent dispatch"
        )}</dd>
      </dl>
    </div>
    <div class="detail-card">
      <h4>Description</h4>
      <div>${escapeHtml(route.description || "-")}</div>
    </div>
    <div class="detail-card">
      <h4>Match Patterns</h4>
      <div class="chip-list">
        ${
          patterns.length > 0
            ? patterns.map((pattern) => `<span class="chip">${escapeHtml(pattern)}</span>`).join("")
            : '<span class="muted">No patterns defined.</span>'
        }
      </div>
    </div>
    <div class="detail-card">
      <h4>Routing Metadata</h4>
      <dl>
        <dt>Input Mapping</dt>
        <dd>${escapeHtml(inputMappingKeys.length > 0 ? inputMappingKeys.join(", ") : "None")}</dd>
        <dt>Agent Defaults</dt>
        <dd>${escapeHtml(agentDefaultKeys.length > 0 ? agentDefaultKeys.join(", ") : "None")}</dd>
        <dt>Query Params</dt>
        <dd>${escapeHtml(
          Object.keys(route.endpoint?.queryParams || {}).length > 0
            ? Object.keys(route.endpoint.queryParams).join(", ")
            : "None"
        )}</dd>
        <dt>Headers</dt>
        <dd>${escapeHtml(
          Object.keys(route.endpoint?.headers || {}).length > 0
            ? Object.keys(route.endpoint.headers).join(", ")
            : "None"
        )}</dd>
      </dl>
    </div>
  `;

  raw.textContent = JSON.stringify(route, null, 2);
}

function renderRoutes(routes) {
  const tbody = $("routesTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!routes.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="9" class="muted">No routes matched the current filters.</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const route of routes) {
    const tr = document.createElement("tr");
    tr.dataset.routeId = route.id;
    if (route.id === state.selectedRouteId) {
      tr.classList.add("selected");
    }

    tr.innerHTML = `
      <td>${escapeHtml(route.id)}</td>
      <td>
        <div><strong>${escapeHtml(route.capability)}</strong></div>
        <div class="muted">${escapeHtml(route.description)}</div>
      </td>
      <td>${escapeHtml(route.routeType)}</td>
      <td>${escapeHtml(getRouteWorkflow(route))}</td>
      <td>${escapeHtml(String(route.usageCount ?? 0))}</td>
      <td>${escapeHtml(formatTimestamp(route.lastUsedAt))}</td>
      <td><pre>${escapeHtml(getRouteTarget(route))}</pre></td>
      <td>${escapeHtml(summarizePatterns(route))}</td>
      <td>
        <button class="secondary-button table-action" data-view="${escapeHtml(route.id)}">Inspect</button>
        <button class="danger-button table-action" data-delete="${escapeHtml(route.id)}">Delete</button>
      </td>
    `;

    tr.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      void loadRouteDetails(route.id);
    });

    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-view]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const routeId = btn.getAttribute("data-view");
      if (!routeId) return;
      await loadRouteDetails(routeId);
    });
  });

  tbody.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const routeId = btn.getAttribute("data-delete");
      if (!routeId) return;
      if (!confirm(`Delete ${routeId}?`)) return;
      try {
        status(`Deleting ${routeId}...`);
        await api(`/admin/routes/${routeId}`, { method: "DELETE" });
        state.routeCache.delete(routeId);
        if (state.selectedRouteId === routeId) {
          state.selectedRouteId = null;
          renderRouteDetails(null);
          closeRouteModal();
        }
        await loadAll();
        status(`Deleted ${routeId}`);
      } catch (err) {
        status(`Delete failed: ${err.message}`);
      }
    });
  });
}

function formatEventTone(eventType) {
  const value = String(eventType || "").toLowerCase();
  if (value.includes("deleted") || value.includes("failed")) return "error";
  if (value.includes("backfill") || value.includes("export")) return "warning";
  if (value.includes("matched") || value.includes("used")) return "info";
  return "success";
}

function eventDetailChips(details) {
  const entries = Object.entries(details || {}).filter(([, value]) => {
    return value !== null && value !== undefined && String(value).trim().length > 0;
  });

  if (entries.length === 0) return "";

  return `
    <div class="chip-list">
      ${entries
        .slice(0, 3)
        .map(
          ([key, value]) =>
            `<span class="chip">${escapeHtml(humanizeToken(key))}: ${escapeHtml(
              typeof value === "object" ? JSON.stringify(value) : String(value)
            )}</span>`
        )
        .join("")}
    </div>
  `;
}

function renderEvents(events) {
  const container = $("events");
  if (!container) return;

  setText("eventsCount", `${events.length} events`);

  if (!events.length) {
    container.innerHTML = '<div class="empty-state">No route events are available yet.</div>';
    return;
  }

  container.innerHTML = events
    .map((event) => {
      const tone = formatEventTone(event.eventType);
      const routeLabel = event.routeId ? `Route ${event.routeId}` : "Global admin event";
      const meta = [routeLabel];
      if (event.agentId) meta.push(`Agent ${event.agentId}`);
      if (event.runId) meta.push(`Run ${event.runId}`);
      meta.push(formatTimestamp(event.createdAt));

      return `
        <article class="activity-item">
          <div class="activity-top">
            <div class="activity-title">${escapeHtml(humanizeToken(event.eventType))}</div>
            <span class="status-tag ${tone}">${escapeHtml(humanizeToken(event.eventType))}</span>
          </div>
          <div class="activity-meta">${escapeHtml(meta.join(" • "))}</div>
          ${eventDetailChips(event.details)}
        </article>
      `;
    })
    .join("");
}

function formatRunTone(statusValue) {
  const value = String(statusValue || "").toLowerCase();
  if (value === "completed" || value === "success") return "success";
  if (value === "failed" || value === "error" || value === "crashed") return "error";
  if (value === "queued" || value === "waiting" || value === "pending") return "warning";
  return "info";
}

function renderRuns(summary) {
  const container = $("runs");
  if (!container) return;

  if (summary?.error) {
    setText("runsCount", "Unavailable");
    container.innerHTML = `<div class="empty-state">${escapeHtml(
      summary.detail || summary.error
    )}</div>`;
    return;
  }

  const total = Number(summary?.total ?? 0);
  const latest = Array.isArray(summary?.latest) ? summary.latest : [];
  const byStatus = summary?.byStatus && typeof summary.byStatus === "object" ? summary.byStatus : {};

  setText("runsCount", `${total} runs`);

  const statusChips = Object.entries(byStatus)
    .map(
      ([key, value]) =>
        `<span class="mini-pill">${escapeHtml(humanizeToken(key))}: ${escapeHtml(
          String(value)
        )}</span>`
    )
    .join("");

  const latestMarkup =
    latest.length > 0
      ? latest
          .map((run) => {
            const tone = formatRunTone(run.status);
            const meta = [run.taskIdentifier || "Unknown task", formatTimestamp(run.createdAt)];
            if (run.finishedAt) {
              meta.push(`Finished ${formatTimestamp(run.finishedAt)}`);
            }

            return `
              <article class="run-item">
                <div class="run-top">
                  <div class="run-title">${escapeHtml(run.id || "Unknown run")}</div>
                  <span class="status-tag ${tone}">${escapeHtml(
                    humanizeToken(run.status || "unknown")
                  )}</span>
                </div>
                <div class="run-meta">${escapeHtml(meta.join(" • "))}</div>
              </article>
            `;
          })
          .join("")
      : '<div class="empty-state">No recent Trigger runs were returned.</div>';

  container.innerHTML = `
    <div class="run-overview">
      <div class="run-stat">
        <div class="run-stat-label">Runs in snapshot</div>
        <div class="run-stat-value">${escapeHtml(String(total))}</div>
      </div>
      <div class="run-stat">
        <div class="run-stat-label">Distinct statuses</div>
        <div class="run-stat-value">${escapeHtml(String(Object.keys(byStatus).length))}</div>
      </div>
    </div>
    <div class="run-status-list">${statusChips || '<span class="mini-pill">No status data</span>'}</div>
    <div class="run-stack" style="margin-top: 14px;">${latestMarkup}</div>
  `;
}

function formatSlackStatusTone(statusValue) {
  const value = String(statusValue || "").toLowerCase();
  if (value === "approved" || value === "route_added") return "success";
  if (value === "rejected") return "error";
  if (value === "dismissed") return "info";
  if (value === "timed_out" || value === "sent" || value === "responded") return "warning";
  return "info";
}

function renderSlackHitl(summaryPayload, messages) {
  const summary = summaryPayload?.summary || {};
  const container = $("slackMessages");
  if (!container) return;

  const channelLabel =
    summaryPayload?.channelFilter ||
    summaryPayload?.configuredAdminChannel ||
    "All tracked channels";

  setText("slackChannelPill", channelLabel);
  setText("slackMessagesCount", `${messages.length} messages`);
  setText("slackTotalMessages", String(summary.total ?? 0));
  setText("slackRespondedThreads", String(summary.responded ?? 0));
  setText("slackRouteAddedCount", String(summary.routeAdded ?? 0));
  setText("slackApprovedCount", String(summary.approved ?? 0));
  setText("slackDismissedCount", String(summary.dismissed ?? 0));
  setText("slackPendingCount", String(summary.pending ?? 0));
  setText("slackRejectedCount", String(summary.rejected ?? 0));
  setText("slackTimedOutCount", String(summary.timedOut ?? 0));
  setText("slackEscalationCount", String(summary.escalations ?? 0));
  setText("slackRouteLearningCount", String(summary.routeLearning ?? 0));
  setText("slackNotificationCount", String(summary.notifications ?? 0));

  if (!messages.length) {
    container.innerHTML =
      '<div class="empty-state">No tracked Slack HITL messages yet. New Slack notifications, escalations, and route-learning prompts will appear here after they are sent.</div>';
    return;
  }

  container.innerHTML = messages
    .map((message) => {
      const tone = formatSlackStatusTone(message.status);
      const meta = [
        humanizeToken(message.kind || "message"),
        message.channel || "Unknown channel",
        formatTimestamp(message.createdAt),
      ];
      if (message.respondedBy) meta.push(`Responder ${message.respondedBy}`);
      if (message.runId) meta.push(`Run ${message.runId}`);

      const detailChips = [
        message.severity ? `Severity: ${humanizeToken(message.severity)}` : null,
        message.addedRouteId ? `Added Route: ${message.addedRouteId}` : null,
        message.respondedAt ? `Responded: ${formatTimestamp(message.respondedAt)}` : null,
        message.resolvedAt ? `Resolved: ${formatTimestamp(message.resolvedAt)}` : null,
      ].filter(Boolean);

      return `
        <article class="activity-item">
          <div class="activity-top">
            <div class="activity-title">${escapeHtml(
              message.taskDescription || "Slack HITL thread"
            )}</div>
            <span class="status-tag ${tone}">${escapeHtml(
              humanizeToken(message.status || "sent")
            )}</span>
          </div>
          <div class="activity-meta">${escapeHtml(meta.join(" • "))}</div>
          ${
            message.reason
              ? `<div class="muted">${escapeHtml(message.reason)}</div>`
              : ""
          }
          ${
            message.responseText
              ? `<pre>${escapeHtml(message.responseText)}</pre>`
              : ""
          }
          <div class="chip-list">
            <span class="chip">Thread ${escapeHtml(message.threadTs || "-")}</span>
            ${detailChips
              .map((value) => `<span class="chip">${escapeHtml(value)}</span>`)
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function formatAuditPhaseLabel(phase) {
  const value = String(phase || "unknown").toLowerCase();
  if (value === "sub-agent") return "Sub-Agents";
  return humanizeToken(value);
}

function renderAuditSummary(payload, errorMessage = null) {
  if (errorMessage) {
    [
      "auditTotalRuns",
      "auditRunningRuns",
      "auditFailedRuns",
      "auditEventTotal",
      "auditWarningTotal",
      "auditErrorTotal",
    ].forEach((id) => setText(id, "Unavailable"));
    setText("auditStatusPill", errorMessage);
    return;
  }

  const summary = payload?.summary || {};
  setText("auditTotalRuns", humanizeCount(summary.totalRuns || 0));
  setText("auditRunningRuns", humanizeCount(summary.runningRuns || 0));
  setText(
    "auditFailedRuns",
    humanizeCount((summary.failedRuns || 0) + (summary.rejectedRuns || 0))
  );
  setText("auditEventTotal", humanizeCount(summary.totalEvents || 0));
  setText("auditWarningTotal", humanizeCount(summary.totalWarnings || 0));
  setText("auditErrorTotal", humanizeCount(summary.totalErrors || 0));
  setText(
    "auditStatusPill",
    `${humanizeCount(summary.totalRuns || 0)} runs · ${humanizeCount(summary.totalEvents || 0)} events`
  );

  const phaseMeta = $("auditPhaseMeta");
  if (phaseMeta) {
    const byPhase = Array.isArray(summary.byPhase) ? summary.byPhase : [];
    phaseMeta.innerHTML =
      byPhase.length > 0
        ? byPhase
            .slice(0, 5)
            .map(
              (entry) =>
                `<span class="mini-pill">${escapeHtml(formatAuditPhaseLabel(entry.phase))}: ${escapeHtml(
                  humanizeCount(entry.events)
                )}</span>`
            )
            .join("")
        : '<span class="mini-pill">No events yet</span>';
  }
}

// ── Audit tree helpers ────────────────────────────────────────────────────────

function auditStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "success") return "✓";
  if (s === "failed" || s === "error") return "✗";
  if (s === "warning") return "⚠";
  if (s === "running") return "⟳";
  return "ℹ";
}

function auditNodeIcon(node) {
  if (node.type === "run") return "🔵";
  if (node.type === "phase") return "🟣";
  if (node.type === "component") {
    return String(node.componentKind || "").toLowerCase().includes("agent") ? "🤖" : "⚡";
  }
  const s = String(node.status || "").toLowerCase();
  if (s === "completed" || s === "success") return "✓";
  if (s === "failed" || s === "error") return "✗";
  if (s === "warning") return "⚠";
  return "ℹ";
}

function buildAuditTree(run, events) {
  const eventsArr = Array.isArray(events) ? events : [];

  const phaseMap = new Map();
  eventsArr.forEach((ev) => {
    const phase = ev.phase || "unknown";
    if (!phaseMap.has(phase)) phaseMap.set(phase, new Map());
    const compKey = `${ev.componentKind || ""}::${ev.componentId || ""}`;
    if (!phaseMap.get(phase).has(compKey)) phaseMap.get(phase).set(compKey, []);
    phaseMap.get(phase).get(compKey).push(ev);
  });

  function statusFromEvents(evs) {
    const ss = evs.map((e) => String(e.status || "").toLowerCase());
    if (ss.some((s) => s === "failed" || s === "error")) return "failed";
    if (ss.some((s) => s === "warning")) return "warning";
    if (ss.length > 0 && ss.every((s) => s === "completed" || s === "success")) return "completed";
    return "info";
  }

  const runNode = {
    type: "run",
    id: `run::${run.pipelineRunId}`,
    label: run.pipelineRunId,
    run,
    status: run.status,
    expanded: true,
    children: [],
  };

  phaseMap.forEach((compMap, phase) => {
    const phaseEvs = Array.from(compMap.values()).flat();
    const phaseNode = {
      type: "phase",
      id: `phase::${phase}`,
      label: formatAuditPhaseLabel(phase),
      phase,
      events: phaseEvs,
      status: statusFromEvents(phaseEvs),
      expanded: true,
      children: [],
    };

    compMap.forEach((compEvs, compKey) => {
      const [componentKind, componentId] = compKey.split("::");
      const compNode = {
        type: "component",
        id: `comp::${phase}::${compKey}`,
        label: componentId || componentKind || "component",
        componentKind: componentKind || null,
        componentId: componentId || null,
        events: compEvs,
        status: statusFromEvents(compEvs),
        expanded: false,
        children: compEvs.map((ev, idx) => ({
          type: "event",
          id: `event::${ev.id || idx}::${ev.eventType}`,
          label: humanizeToken(ev.eventType || "event"),
          event: ev,
          status: ev.status || "info",
          expanded: false,
          children: [],
        })),
      };
      phaseNode.children.push(compNode);
    });

    runNode.children.push(phaseNode);
  });

  return runNode;
}

function renderAuditTreeNode(node, view = auditViewConfig()) {
  const wrap = document.createElement("div");
  wrap.className = "audit-tree-node";

  const row = document.createElement("div");
  row.className =
    "audit-tree-row" + (node.id === state.audit[view.selectionKey] ? " active" : "");
  row.dataset.nodeId = node.id;

  const toggle = document.createElement("span");
  toggle.className = "audit-toggle";
  toggle.textContent = node.children.length ? (node.expanded ? "▾" : "▸") : "";
  row.appendChild(toggle);

  const icon = document.createElement("span");
  icon.className = "audit-node-icon";
  icon.textContent = auditNodeIcon(node);
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "audit-node-label";
  label.textContent = node.label;
  row.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "audit-node-badge";
  badge.textContent = auditStatusBadge(node.status);
  row.appendChild(badge);

  wrap.appendChild(row);

  let childrenWrap = null;
  if (node.children.length) {
    childrenWrap = document.createElement("div");
    childrenWrap.className = "audit-tree-children" + (node.expanded ? "" : " collapsed");
    node.children.forEach((child) =>
      childrenWrap.appendChild(renderAuditTreeNode(child, view))
    );
    wrap.appendChild(childrenWrap);
  }

  row.addEventListener("click", (e) => {
    e.stopPropagation();
    if (node.children.length) {
      node.expanded = !node.expanded;
      toggle.textContent = node.expanded ? "▾" : "▸";
      childrenWrap.classList.toggle("collapsed", !node.expanded);
    }
    selectAuditNode(node, view);
  });

  return wrap;
}

function selectAuditNode(node, view = auditViewConfig()) {
  state.audit[view.selectionKey] = node.id;
  const container = $(view.containerId);
  if (container) {
    container.querySelectorAll(".audit-tree-row").forEach((row) => {
      row.classList.toggle("active", row.dataset.nodeId === node.id);
    });
  }
  renderAuditNodeDetail(node, view);
}

function renderAuditNodeDetail(node, view = auditViewConfig()) {
  const pane = $(view.detailId);
  if (!pane) return;
  pane.innerHTML = "";

  const heading = document.createElement("p");
  heading.className = "audit-detail-heading";

  if (node.type === "run") {
    const run = node.run;
    heading.textContent = "Pipeline Run";
    pane.appendChild(heading);

    const dl = document.createElement("dl");
    dl.className = "audit-kv";
    dl.innerHTML = `
      <dt>Run ID</dt><dd>${escapeHtml(run.pipelineRunId)}</dd>
      <dt>Session</dt><dd>${escapeHtml(run.sessionId || "—")}</dd>
      <dt>Brand</dt><dd>${escapeHtml(run.brandId || "global")}</dd>
      <dt>Audience</dt><dd>${escapeHtml(run.audience || "—")}</dd>
      <dt>Scope</dt><dd>${escapeHtml(run.scope || "—")}</dd>
      <dt>Source</dt><dd>${escapeHtml(run.source || "—")}</dd>
      <dt>Status</dt><dd>${escapeHtml(humanizeToken(run.status || "—"))}</dd>
      <dt>Started</dt><dd>${escapeHtml(formatTimestamp(run.startedAt))}</dd>
      <dt>Finished</dt><dd>${escapeHtml(run.finishedAt ? formatTimestamp(run.finishedAt) : "Running…")}</dd>
      <dt>Events</dt><dd>${escapeHtml(humanizeCount(run.totalEvents || 0))}</dd>
      <dt>Warnings</dt><dd>${escapeHtml(humanizeCount(run.totalWarnings || 0))}</dd>
      <dt>Errors</dt><dd>${escapeHtml(humanizeCount(run.totalErrors || 0))}</dd>
    `;
    pane.appendChild(dl);

    if (run.userPrompt) {
      const lbl = document.createElement("p");
      lbl.className = "audit-payload-label";
      lbl.textContent = "User Prompt";
      pane.appendChild(lbl);
      const pre = document.createElement("pre");
      pre.style.cssText =
        "font-size:0.78rem;white-space:pre-wrap;word-break:break-word;margin:0;background:rgba(0,0,0,0.03);padding:10px 12px;border-radius:8px;";
      pre.textContent = run.userPrompt;
      pane.appendChild(pre);
    }
  } else if (node.type === "phase") {
    heading.textContent = `Phase — ${node.label}`;
    pane.appendChild(heading);

    const firstTs = node.events.length ? formatTimestamp(node.events[0]?.createdAt) : "—";
    const lastTs =
      node.events.length > 1
        ? formatTimestamp(node.events[node.events.length - 1]?.createdAt)
        : firstTs;
    const warnings = node.events.filter((e) => String(e.status || "").toLowerCase() === "warning");
    const errors = node.events.filter((e) => {
      const s = String(e.status || "").toLowerCase();
      return s === "failed" || s === "error";
    });

    const dl = document.createElement("dl");
    dl.className = "audit-kv";
    dl.innerHTML = `
      <dt>Phase</dt><dd>${escapeHtml(node.label)}</dd>
      <dt>Events</dt><dd>${escapeHtml(humanizeCount(node.events.length))}</dd>
      <dt>Warnings</dt><dd>${escapeHtml(humanizeCount(warnings.length))}</dd>
      <dt>Errors</dt><dd>${escapeHtml(humanizeCount(errors.length))}</dd>
      <dt>First event</dt><dd>${escapeHtml(firstTs)}</dd>
      <dt>Last event</dt><dd>${escapeHtml(lastTs)}</dd>
    `;
    pane.appendChild(dl);
  } else if (node.type === "component") {
    heading.textContent = `Component — ${node.label}`;
    pane.appendChild(heading);

    const modelAlias = node.events.map((e) => e.modelAlias).find(Boolean);
    const resolvedModelId = node.events.map((e) => e.resolvedModelId).find(Boolean);
    const provider = node.events.map((e) => e.provider).find(Boolean);
    const totalTokens = node.events.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);
    const totalDuration = node.events.reduce((sum, e) => sum + (e.durationMs || 0), 0);

    const dl = document.createElement("dl");
    dl.className = "audit-kv";
    dl.innerHTML = `
      <dt>Kind</dt><dd>${escapeHtml(node.componentKind || "—")}</dd>
      <dt>ID</dt><dd>${escapeHtml(node.componentId || "—")}</dd>
      ${modelAlias ? `<dt>Model alias</dt><dd>${escapeHtml(modelAlias)}</dd>` : ""}
      ${resolvedModelId ? `<dt>Model</dt><dd>${escapeHtml(resolvedModelId)}</dd>` : ""}
      ${provider ? `<dt>Provider</dt><dd>${escapeHtml(provider)}</dd>` : ""}
      <dt>Events</dt><dd>${escapeHtml(humanizeCount(node.events.length))}</dd>
      ${totalTokens > 0 ? `<dt>Tokens (total)</dt><dd>${escapeHtml(humanizeCount(totalTokens))}</dd>` : ""}
      ${totalDuration > 0 ? `<dt>Duration (total)</dt><dd>${escapeHtml(String(totalDuration) + " ms")}</dd>` : ""}
      <dt>Status</dt><dd>${escapeHtml(humanizeToken(node.status || "—"))}</dd>
    `;
    pane.appendChild(dl);
  } else if (node.type === "event") {
    const ev = node.event;
    heading.textContent = `Event — ${humanizeToken(ev.eventType || "")}`;
    pane.appendChild(heading);

    const dl = document.createElement("dl");
    dl.className = "audit-kv";
    dl.innerHTML = `
      <dt>Event type</dt><dd>${escapeHtml(ev.eventType || "—")}</dd>
      <dt>Status</dt><dd>${escapeHtml(humanizeToken(ev.status || "—"))}</dd>
      ${ev.sequence != null ? `<dt>Sequence</dt><dd>${escapeHtml(String(ev.sequence))}</dd>` : ""}
      ${ev.componentKind ? `<dt>Component kind</dt><dd>${escapeHtml(ev.componentKind)}</dd>` : ""}
      ${ev.componentId ? `<dt>Component ID</dt><dd>${escapeHtml(ev.componentId)}</dd>` : ""}
      ${ev.durationMs != null ? `<dt>Duration</dt><dd>${escapeHtml(String(ev.durationMs) + " ms")}</dd>` : ""}
      ${ev.tokensUsed != null ? `<dt>Tokens used</dt><dd>${escapeHtml(humanizeCount(ev.tokensUsed))}</dd>` : ""}
      ${ev.createdAt ? `<dt>Timestamp</dt><dd>${escapeHtml(formatTimestamp(ev.createdAt))}</dd>` : ""}
    `;
    pane.appendChild(dl);

    if (ev.payload) {
      const lbl = document.createElement("p");
      lbl.className = "audit-payload-label";
      lbl.textContent = "Payload";
      pane.appendChild(lbl);
      pane.appendChild(renderAuditPayloadInspector(ev.payload));
    }
  }
}

function renderAuditRuns(payload) {
  const tbody = $("auditRunsTable");
  if (!tbody) return;

  const runs = Array.isArray(payload?.runs) ? payload.runs : [];
  setText("auditRunsCount", `${humanizeCount(payload?.total || 0)} runs`);
  tbody.innerHTML = "";

  if (!runs.length) {
    tbody.innerHTML =
      '<tr><td colspan="12" class="empty-state">No runs matched.</td></tr>';
    return;
  }

  runs.forEach((run) => {
    const tr = document.createElement("tr");
    tr.className =
      "audit-run-row" +
      (run.pipelineRunId === state.audit.selectedPipelineRunId ? " selected" : "");

    const btn = document.createElement("button");
    btn.className = "secondary-button table-action";
    btn.textContent = "Inspect";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await loadAuditRunDetails(run.pipelineRunId, { openModal: true });
    });

    tr.innerHTML = `
      <td><code>${escapeHtml(run.pipelineRunId)}</code></td>
      <td>${escapeHtml(run.brandId || "global")}</td>
      <td><span class="audit-status-cell">${escapeHtml(auditStatusBadge(run.status))} ${escapeHtml(
        humanizeToken(run.status || "unknown")
      )}</span></td>
      <td>${escapeHtml(run.audience || "—")}</td>
      <td>${escapeHtml(run.scope || "—")}</td>
      <td>${escapeHtml(run.source || "—")}</td>
      <td>${escapeHtml(humanizeCount(run.totalEvents || 0))}</td>
      <td>${escapeHtml(humanizeCount(run.totalWarnings || 0))}</td>
      <td>${escapeHtml(humanizeCount(run.totalErrors || 0))}</td>
      <td>${escapeHtml(formatTimestamp(run.startedAt))}</td>
      <td>${escapeHtml(run.finishedAt ? formatTimestamp(run.finishedAt) : "Running…")}</td>
      <td></td>
    `;
    tr.lastElementChild?.appendChild(btn);

    tr.addEventListener("click", async (event) => {
      if (event.target.closest("button")) return;
      await loadAuditRunDetails(run.pipelineRunId, { openModal: true });
    });
    tbody.appendChild(tr);
  });
}

function renderAuditRunDetails(run, events, view = auditViewConfig()) {
  const treeContainer = $(view.containerId);
  const detailPanel = $(view.detailId);
  if (!treeContainer || !detailPanel) return;

  if (!run) {
    treeContainer.innerHTML =
      '<div class="empty-state" style="padding:12px;font-size:0.8rem">Select a run to view its tree.</div>';
    detailPanel.innerHTML = '<div class="empty-state">Select a node to view details.</div>';
    state.audit[view.treeKey] = null;
    state.audit[view.selectionKey] = null;
    return;
  }

  const tree = buildAuditTree(run, events);
  state.audit[view.treeKey] = tree;
  state.audit[view.selectionKey] = tree.id;

  treeContainer.innerHTML = "";
  treeContainer.appendChild(renderAuditTreeNode(tree, view));

  selectAuditNode(tree, view);
}

function renderAuditModalRun(run, events) {
  setText("auditModalTitle", run?.pipelineRunId || "Run Tree");
  setText(
    "auditModalMeta",
    run
      ? `${run.brandId || "global"} • ${humanizeToken(run.status || "unknown")} • ${
          run.audience || "—"
        } • ${humanizeCount(run.totalEvents || 0)} events`
      : "Select a run to inspect the audit tree."
  );
  setText("auditModalPill", run?.pipelineRunId || "No run selected");
  renderAuditRunDetails(run, events, auditViewConfig("modal"));
}

async function loadAuditRunDetails(pipelineRunId, options = {}) {
  state.audit.selectedPipelineRunId = pipelineRunId;
  const payload = await api(`/admin/audit/runs/${pipelineRunId}`);
  state.audit.selectedRun = payload.run || null;
  state.audit.selectedEvents = payload.events || [];
  renderAuditRuns({ runs: state.audit.runs, total: state.audit.total });
  if (options.openModal) {
    renderAuditModalRun(state.audit.selectedRun, state.audit.selectedEvents);
    openAuditModal();
  }
}

async function loadAudit() {
  const params = new URLSearchParams({
    audience: $("auditAudience")?.value || "marketer",
    days: $("auditDays")?.value || "7",
    status: $("auditStatus")?.value || "all",
    limit: "25",
    offset: "0",
  });
  const brandId = $("auditBrand")?.value || "";
  if (brandId) params.set("brandId", brandId);

  const [summaryData, runsData] = await Promise.all([
    api(`/admin/audit/summary?${params.toString()}`),
    api(`/admin/audit/runs?${params.toString()}`),
  ]);

  state.audit.summary = summaryData;
  state.audit.runs = runsData.runs || [];
  state.audit.total = runsData.total || 0;
  renderAuditSummary(summaryData);
  renderAuditRuns(runsData);

  const selected =
    state.audit.selectedPipelineRunId &&
    state.audit.runs.some((run) => run.pipelineRunId === state.audit.selectedPipelineRunId)
      ? state.audit.selectedPipelineRunId
      : state.audit.runs[0]?.pipelineRunId;

  if (!selected) {
    state.audit.selectedPipelineRunId = null;
    state.audit.selectedRun = null;
    state.audit.selectedEvents = [];
    renderAuditModalRun(null, []);
    return;
  }

  state.audit.selectedPipelineRunId = selected;
  renderAuditRuns(runsData);
}

function getSelectedAdminChatBrandId() {
  return $("adminChatBrand")?.value.trim() || "";
}

function setAdminChatSession(sessionId) {
  state.adminChat.sessionId = sessionId || null;
  if (state.adminChat.sessionId) {
    window.sessionStorage.setItem("admin-chat-session-id", state.adminChat.sessionId);
  } else {
    window.sessionStorage.removeItem("admin-chat-session-id");
  }

  setText(
    "adminChatSessionState",
    state.adminChat.sessionId
      ? `Session ${state.adminChat.sessionId.slice(0, 12)}`
      : "No active session"
  );
}

function setAdminChatComposerState(text) {
  setText("adminChatComposerState", text);
}

function updateAdminChatScopeNote() {
  const brandId = getSelectedAdminChatBrandId();
  const brand = state.brands.find((item) => item.id === brandId);
  setText(
    "adminChatScopeNote",
    brand
      ? `Admin chat is currently scoped to brand "${brand.name}" (${brand.id}).`
      : "Admin chat is currently using the global scope across all brands."
  );
}

function populateBrandSelect(selectId, brands) {
  const select = $(selectId);
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '<option value="">All brands / global</option>';

  brands.forEach((brand) => {
    const option = document.createElement("option");
    option.value = brand.id;
    option.textContent = `${brand.name} (${brand.id})`;
    select.appendChild(option);
  });

  if (previousValue && brands.some((brand) => brand.id === previousValue)) {
    select.value = previousValue;
  }
}

function renderBrandOptions(brands) {
  populateBrandSelect("adminChatBrand", brands);
  populateBrandSelect("tokenUsageBrand", brands);
  populateBrandSelect("auditBrand", brands);
  updateAdminChatScopeNote();
}

function appendAdminChatMessage(message) {
  state.adminChat.messages.push({
    id: message.id || `${message.role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: message.timestamp || new Date().toISOString(),
    ...message,
  });
  renderAdminChatMessages();
}

function buildAdminChatMessageNode(message) {
  const article = document.createElement("article");
  article.className = `chat-message ${message.role}`;

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  meta.innerHTML = `
    <span class="chat-role">${escapeHtml(humanizeToken(message.role))}</span>
    <span>${escapeHtml(formatTimestamp(message.timestamp))}</span>
  `;
  article.appendChild(meta);

  if (message.loading) {
    const loader = document.createElement("div");
    loader.className = "chat-loader";
    loader.innerHTML = '<span class="chat-loader-dot"></span><span>Waiting for the admin orchestrator...</span>';
    article.appendChild(loader);
    return article;
  }

  if (message.role === "assistant") {
    article.appendChild(renderAssistantMarkdown(message.content || ""));
  } else {
    const body = document.createElement("div");
    body.className = "chat-content";
    const paragraph = document.createElement("p");
    paragraph.textContent = message.content || "";
    body.appendChild(paragraph);
    article.appendChild(body);
  }

  if (Array.isArray(message.trace) && message.trace.length > 0) {
    const details = document.createElement("details");
    details.className = "raw-json";
    const summary = document.createElement("summary");
    summary.textContent = `Trace (${message.trace.length} steps)`;
    details.appendChild(summary);
    const pre = document.createElement("pre");
    pre.textContent = prettyJson(message.trace);
    details.appendChild(pre);
    article.appendChild(details);
  }

  if (message.raw) {
    const details = document.createElement("details");
    details.className = "raw-json";
    const summary = document.createElement("summary");
    summary.textContent = "Raw JSON";
    details.appendChild(summary);
    const pre = document.createElement("pre");
    pre.textContent = prettyJson(message.raw);
    details.appendChild(pre);
    article.appendChild(details);
  }

  return article;
}

function renderAdminChatMessages() {
  const container = $("adminChatLog");
  if (!container) return;

  container.innerHTML = "";

  if (!state.adminChat.messages.length) {
    container.innerHTML =
      '<div class="empty-state">Start a new admin conversation to inspect telemetry, runs, or brand-scoped operations data.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  state.adminChat.messages.forEach((message) => {
    fragment.appendChild(buildAdminChatMessageNode(message));
  });

  if (state.adminChat.loading) {
    fragment.appendChild(
      buildAdminChatMessageNode({
        role: "assistant",
        content: "",
        loading: true,
        timestamp: new Date().toISOString(),
      })
    );
  }

  container.appendChild(fragment);
  container.scrollTop = container.scrollHeight;
}

function renderAdminUsageSummary(payload, errorMessage = null) {
  if (errorMessage) {
    setText("adminChatTodayTokens", "Unavailable");
    setText("adminChatSevenDayTokens", "Unavailable");
    setText("adminChatSevenDayPrompts", "Unavailable");
    setText("adminChatTopProvider", "Unavailable");
    setText("adminChatScopeNote", errorMessage);
    return;
  }

  const summary = payload?.summary || {};
  const daily = Array.isArray(summary.daily) ? summary.daily : [];
  const latestDay = daily[daily.length - 1] || null;
  const byProvider = Array.isArray(summary.byProvider) ? summary.byProvider : [];
  const topProvider = byProvider[0] || null;

  setText(
    "adminChatTodayTokens",
    latestDay ? humanizeCount(latestDay.totalTokens ?? latestDay.tokens) : "0"
  );
  setText("adminChatSevenDayTokens", humanizeCount(summary.totalTokens || 0));
  setText("adminChatSevenDayPrompts", humanizeCount(summary.totalPrompts || 0));
  setText(
    "adminChatTopProvider",
    topProvider ? `${humanizeToken(topProvider.provider)} (${humanizeCount(topProvider.tokens)})` : "None yet"
  );
}

function humanizeCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function mapHistoryMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    id: `${message.role}-${message.timestamp || Date.now()}`,
    role: message.role || "system",
    content: String(message.content || ""),
    timestamp: message.timestamp || new Date().toISOString(),
  }));
}

function isTerminalStatus(statusValue) {
  return ["COMPLETED", "FAILED", "CANCELED"].includes(String(statusValue || "").toUpperCase());
}

async function loadBrands() {
  const data = await api("/admin/brands");
  state.brands = data.brands || [];
  renderBrandOptions(state.brands);
}

async function loadAdminUsageSummary() {
  try {
    const brandId = getSelectedAdminChatBrandId();
    const params = new URLSearchParams({
      audience: "marketer",
      days: "7",
    });
    if (brandId) {
      params.set("brandId", brandId);
    }

    const data = await api(`/admin/llm-usage/summary?${params.toString()}`);
    state.llmUsageSummary = data;
    renderAdminUsageSummary(data);
  } catch (error) {
    renderAdminUsageSummary(null, "Telemetry unavailable for the current admin scope.");
    status(`Telemetry unavailable: ${error.message}`);
  }
}

function getSelectedTokenUsageBrandId() {
  return $("tokenUsageBrand")?.value || "";
}

function getSelectedTokenUsageAudience() {
  return $("tokenUsageAudience")?.value || "marketer";
}

function getSelectedTokenUsageDays() {
  return $("tokenUsageDays")?.value || "7";
}

function renderTokenUsageSummary(payload, errorMessage = null) {
  if (errorMessage) {
    [
      "tokenUsageTodayInput",
      "tokenUsageTodayOutput",
      "tokenUsageWindowTotal",
      "tokenUsageWindowPrompts",
      "tokenUsageWindowCalls",
    ].forEach((id) => setText(id, "Unavailable"));
    setText("tokenUsageCountPill", "Telemetry unavailable");
    setText("tokenUsageScopePill", errorMessage);
    return;
  }

  const summary = payload?.summary || {};
  const daily = Array.isArray(summary.daily) ? summary.daily : [];
  const latestDay = daily[daily.length - 1] || null;
  const todayInput = latestDay ? latestDay.inputTokens || 0 : 0;
  const todayOutput = latestDay ? latestDay.outputTokens || 0 : 0;

  setText("tokenUsageTodayInput", humanizeCount(todayInput));
  setText("tokenUsageTodayOutput", humanizeCount(todayOutput));
  setText("tokenUsageWindowTotal", humanizeCount(summary.totalTokens || 0));
  setText("tokenUsageWindowPrompts", humanizeCount(summary.totalPrompts || 0));
  setText("tokenUsageWindowCalls", humanizeCount(summary.totalLlmCalls || 0));
  setText(
    "tokenUsageCountPill",
    `${humanizeCount(summary.totalPrompts || 0)} prompt runs`
  );
  setText(
    "tokenUsageScopePill",
    `${getSelectedTokenUsageAudience()} · ${getSelectedTokenUsageDays()} days`
  );

  const tbody = $("tokenUsageDailyTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!daily.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">No token usage has been tracked for this window yet.</td></tr>';
    return;
  }

  daily.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(entry.bucket)}</td>
      <td>${escapeHtml(humanizeCount(entry.promptCount || 0))}</td>
      <td>${escapeHtml(humanizeCount(entry.llmCallCount || 0))}</td>
      <td>${escapeHtml(humanizeCount(entry.inputTokens || 0))}</td>
      <td>${escapeHtml(humanizeCount(entry.outputTokens || 0))}</td>
      <td>${escapeHtml(humanizeCount(entry.totalTokens || entry.tokens || 0))}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTokenUsagePrompts(payload, errorMessage = null) {
  const tbody = $("tokenUsagePromptTable");
  if (!tbody) return;

  if (errorMessage) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(
      errorMessage
    )}</td></tr>`;
    setText("tokenUsagePromptPageInfo", "Unavailable");
    setText("tokenUsagePromptMeta", "Unavailable");
    return;
  }

  const prompts = Array.isArray(payload?.prompts) ? payload.prompts : [];
  const total = Number(payload?.total || 0);
  const limit = Number(payload?.limit || state.tokenUsage.limit || 20);
  const offset = Number(payload?.offset || 0);
  const pageNumber = Math.floor(offset / Math.max(limit, 1)) + 1;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  setText(
    "tokenUsagePromptPageInfo",
    `${humanizeCount(total)} rows total`
  );
  setText("tokenUsagePromptMeta", `Page ${pageNumber} of ${totalPages}`);
  $("tokenUsagePrev")?.toggleAttribute("disabled", offset <= 0);
  $("tokenUsageNext")?.toggleAttribute("disabled", offset + limit >= total);

  tbody.innerHTML = "";
  if (!prompts.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="empty-state">No prompt history has been tracked for this window yet.</td></tr>';
    return;
  }

  prompts.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.userPrompt || "")}</td>
      <td>${escapeHtml(row.audience || "-")}</td>
      <td>${escapeHtml(row.brandId || "all brands")}</td>
      <td>${escapeHtml(humanizeCount(row.inputTokens || 0))}</td>
      <td>${escapeHtml(humanizeCount(row.outputTokens || 0))}</td>
      <td>${escapeHtml(humanizeCount(row.totalTokens || 0))}</td>
      <td>${escapeHtml(humanizeToken(row.status || "-"))}</td>
      <td>${escapeHtml(formatTimestamp(row.startedAt))}</td>
      <td>${escapeHtml(row.finishedAt ? formatTimestamp(row.finishedAt) : "-")}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadTokenUsagePage() {
  try {
    const params = new URLSearchParams({
      audience: getSelectedTokenUsageAudience(),
      days: getSelectedTokenUsageDays(),
      limit: String(state.tokenUsage.limit),
      offset: String(state.tokenUsage.offset),
    });
    const brandId = getSelectedTokenUsageBrandId();
    if (brandId) {
      params.set("brandId", brandId);
    }

    const [summaryData, promptData] = await Promise.all([
      api(`/admin/llm-usage/summary?${params.toString()}`),
      api(`/admin/llm-usage/prompts?${params.toString()}`),
    ]);

    state.tokenUsage.summary = summaryData;
    state.tokenUsage.prompts = promptData.prompts || [];
    state.tokenUsage.total = promptData.total || 0;
    renderTokenUsageSummary(summaryData);
    renderTokenUsagePrompts(promptData);
  } catch (error) {
    renderTokenUsageSummary(null, "Telemetry unavailable for the selected token-usage scope.");
    renderTokenUsagePrompts(
      null,
      "Prompt history is unavailable for the selected token-usage scope."
    );
    status(`Token usage unavailable: ${error.message}`);
  }
}

async function loadAdminChatHistory() {
  if (!state.adminChat.sessionId) {
    state.adminChat.messages = [];
    renderAdminChatMessages();
    return;
  }

  try {
    const data = await api(`/admin/chat/session/${state.adminChat.sessionId}/history`);
    state.adminChat.messages = mapHistoryMessages(data.messages);
    renderAdminChatMessages();
  } catch (error) {
    if (String(error.message || "").includes("Session not found")) {
      setAdminChatSession(null);
      state.adminChat.messages = [];
      renderAdminChatMessages();
      return;
    }
    throw error;
  }
}

async function pollAdminChatRun(runId) {
  let lastStatus = null;

  while (true) {
    const data = await api(`/admin/chat/status/${runId}`);

    if (data.status !== lastStatus) {
      setAdminChatComposerState(`Run ${runId}: ${data.status}`);
      lastStatus = data.status;
    }

    if (isTerminalStatus(data.status)) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function sendAdminChatPrompt() {
  if (state.adminChat.loading) return;

  const input = $("adminChatInput");
  const text = input?.value.trim() || "";
  if (!text) return;

  const brandId = getSelectedAdminChatBrandId() || null;
  state.adminChat.loading = true;
  renderAdminChatMessages();
  setAdminChatComposerState("Starting admin run...");
  appendAdminChatMessage({
    role: "user",
    content: text,
    timestamp: new Date().toISOString(),
  });

  if (input) {
    input.value = "";
  }

  try {
    const trigger = await api("/admin/chat/message", {
      method: "POST",
      body: JSON.stringify({
        userMessage: text,
        sessionId: state.adminChat.sessionId || undefined,
        brandId,
      }),
    });

    setAdminChatSession(trigger.sessionId);
    state.adminChat.runId = trigger.runId;
    renderAdminChatMessages();

    const final = await pollAdminChatRun(trigger.runId);
    state.adminChat.runId = null;

    if (String(final.status || "").toUpperCase() !== "COMPLETED") {
      appendAdminChatMessage({
        role: "system",
        content: `Run ${trigger.runId} finished with status ${final.status}.`,
        timestamp: new Date().toISOString(),
      });
    } else {
      const output = final.output || {};
      appendAdminChatMessage({
        role: "assistant",
        content: getReadableAssistantText(output),
        trace: output.trace || [],
        raw: output,
        timestamp: final.finishedAt || new Date().toISOString(),
      });
    }

    await Promise.all([loadAdminUsageSummary(), loadRuns()]);
  } catch (error) {
    appendAdminChatMessage({
      role: "system",
      content: `Admin chat failed: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  } finally {
    state.adminChat.loading = false;
    setAdminChatComposerState("Ready for admin prompts");
    renderAdminChatMessages();
    input?.focus();
  }
}

async function clearAdminChatSession() {
  if (!state.adminChat.sessionId) {
    state.adminChat.messages = [];
    renderAdminChatMessages();
    return;
  }

  await api(`/admin/chat/session/${state.adminChat.sessionId}`, { method: "DELETE" });
  setAdminChatSession(null);
  state.adminChat.messages = [];
  renderAdminChatMessages();
  setAdminChatComposerState("Ready for admin prompts");
}

async function loadHealth() {
  const data = await api("/admin/health");
  state.health = data;
  renderHealth(data);
  if (state.selectedRouteId && state.routeCache.has(state.selectedRouteId)) {
    renderRouteDetails(state.routeCache.get(state.selectedRouteId));
  }
}

async function loadRouteDetails(routeId, options = {}) {
  state.selectedRouteId = routeId;
  renderRoutes(state.routes);

  if (!options.silent) {
    status(`Loading ${routeId}...`);
  }

  const data = await api(`/admin/routes/${routeId}`);
  state.routeCache.set(routeId, data.route);
  renderRouteDetails(data.route);

  if (options.openModal !== false) {
    openRouteModal();
  }

  if (!options.silent) {
    status(`Loaded ${routeId}`);
  }
}

async function loadRoutes() {
  const q = $("query")?.value.trim() || "";
  const routeType = $("routeType")?.value || "";
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (routeType) params.set("routeType", routeType);

  const data = await api(`/admin/routes?${params.toString()}`);
  state.routes = data.routes || [];
  state.health = {
    ...(state.health || {}),
    stats: data.stats || {},
  };

  renderHealth(state.health);
  renderRoutes(state.routes);

  if (state.routes.length === 0) {
    state.selectedRouteId = null;
    renderRouteDetails(null);
    closeRouteModal();
    return;
  }

  if (!state.routes.some((route) => route.id === state.selectedRouteId)) {
    state.selectedRouteId = null;
    renderRoutes(state.routes);
    renderRouteDetails(null);
  }
}

async function loadEvents() {
  const data = await api("/admin/events?limit=40");
  state.events = data.events || [];
  renderEvents(state.events);
}

async function loadRuns() {
  const data = await api("/admin/runs/summary?limit=20");
  state.runSummary = data;
  renderRuns(data);
}

async function loadSlackHitl() {
  const [summaryData, messagesData] = await Promise.all([
    api("/admin/slack/summary"),
    api("/admin/slack/messages?limit=20"),
  ]);

  state.slackSummary = summaryData;
  state.slackMessages = messagesData.messages || [];
  renderSlackHitl(summaryData, state.slackMessages);
}

async function loadAll() {
  status("Loading admin workspace...");
  await Promise.all([
    loadBrands(),
    loadHealth(),
    loadRoutes(),
    loadEvents(),
    loadRuns(),
    loadAudit(),
    loadSlackHitl(),
    loadAdminUsageSummary(),
    loadTokenUsagePage(),
    loadKnowledgeFiles(),
  ]);
  status("Admin workspace loaded");
}

$("loadAll")?.addEventListener("click", () => loadAll().catch((err) => status(err.message)));
$("search")?.addEventListener("click", () => loadRoutes().catch((err) => status(err.message)));
$("routeModalClose")?.addEventListener("click", closeRouteModal);
$("routeModalBackdrop")?.addEventListener("click", closeRouteModal);
$("auditRunModalClose")?.addEventListener("click", closeAuditModal);
$("auditRunModalBackdrop")?.addEventListener("click", closeAuditModal);

// ── Audit stats popover toggle ─────────────────────────────────────────────
function positionAuditStatsPopover() {
  const popover = $("auditStatsPopover");
  const trigger = $("auditStatsToggle");
  if (!popover || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const popoverWidth = 300;
  // align right edge of popover with right edge of trigger, but clamp to viewport
  let left = rect.right - popoverWidth;
  if (left < 8) left = 8;
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${left}px`;
}

$("auditStatsToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const popover = $("auditStatsPopover");
  const trigger = $("auditStatsToggle");
  if (!popover || !trigger) return;
  const isOpen = !popover.hidden;
  if (!isOpen) positionAuditStatsPopover();
  popover.hidden = isOpen;
  trigger.setAttribute("aria-expanded", String(!isOpen));
});
document.addEventListener("click", (e) => {
  const popover = $("auditStatsPopover");
  const trigger = $("auditStatsToggle");
  if (!popover || popover.hidden) return;
  if (!popover.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) {
    popover.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
  }
});
$("adminChatSend")?.addEventListener("click", () => {
  void sendAdminChatPrompt();
});
$("adminChatClear")?.addEventListener("click", () => {
  clearAdminChatSession()
    .then(() => status("Admin chat session cleared"))
    .catch((err) => status(err.message));
});
$("adminChatBrand")?.addEventListener("change", () => {
  updateAdminChatScopeNote();
  loadAdminUsageSummary().catch((err) => status(err.message));
});
$("tokenUsageRefresh")?.addEventListener("click", () => {
  state.tokenUsage.offset = 0;
  loadTokenUsagePage().catch((err) => status(err.message));
});
$("tokenUsageAudience")?.addEventListener("change", () => {
  state.tokenUsage.offset = 0;
  loadTokenUsagePage().catch((err) => status(err.message));
});
$("tokenUsageBrand")?.addEventListener("change", () => {
  state.tokenUsage.offset = 0;
  loadTokenUsagePage().catch((err) => status(err.message));
});
$("tokenUsageDays")?.addEventListener("change", () => {
  state.tokenUsage.offset = 0;
  loadTokenUsagePage().catch((err) => status(err.message));
});
$("tokenUsagePrev")?.addEventListener("click", () => {
  state.tokenUsage.offset = Math.max(0, state.tokenUsage.offset - state.tokenUsage.limit);
  loadTokenUsagePage().catch((err) => status(err.message));
});
$("tokenUsageNext")?.addEventListener("click", () => {
  state.tokenUsage.offset += state.tokenUsage.limit;
  loadTokenUsagePage().catch((err) => status(err.message));
});
$("auditRefresh")?.addEventListener("click", () => {
  loadAudit().catch((err) => status(err.message));
});
["auditAudience", "auditBrand", "auditDays", "auditStatus"].forEach((id) => {
  $(id)?.addEventListener("change", () => {
    loadAudit().catch((err) => status(err.message));
  });
});
$("adminChatInput")?.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void sendAdminChatPrompt();
  }
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "#dashboard";
    if (window.location.hash === href) {
      event.preventDefault();
      syncPageFromHash({ scroll: true });
    }
  });
});

window.addEventListener("hashchange", () => {
  syncPageFromHash({ scroll: true });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRouteModal();
    closeAuditModal();
  }
});

$("importBtn")?.addEventListener("click", async () => {
  try {
    status("Backfilling JSON -> DB...");
    const data = await api("/admin/backfill/import", { method: "POST", body: "{}" });
    status(`Imported ${data.imported}, skipped ${data.skipped}`);
    await loadAll();
  } catch (err) {
    status(`Backfill failed: ${err.message}`);
  }
});

$("exportBtn")?.addEventListener("click", async () => {
  try {
    status("Exporting DB -> JSON...");
    const data = await api("/admin/backfill/export", { method: "POST", body: "{}" });
    status(`Exported ${data.exported} routes`);
  } catch (err) {
    status(`Export failed: ${err.message}`);
  }
});

async function bootstrap() {
  await loadUiConfig();
  syncPageFromHash({ scroll: false, instant: true });
  setAdminChatSession(state.adminChat.sessionId);
  setAdminChatComposerState("Ready for admin prompts");
  renderRouteDetails(null);
  renderEvents([]);
  renderRuns({ total: 0, byStatus: {}, latest: [] });
  renderAuditSummary({
    summary: {
      totalRuns: 0,
      runningRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      rejectedRuns: 0,
      totalEvents: 0,
      totalErrors: 0,
      totalWarnings: 0,
      byPhase: [],
      byComponentKind: [],
      byStatus: [],
    },
  });
  renderAuditRuns({ runs: [], total: 0 });
  renderAuditRunDetails(null, []);
  renderAdminChatMessages();
  renderAdminUsageSummary({
    summary: {
      totalPrompts: 0,
      totalLlmCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCalls: 0,
      byProvider: [],
      daily: [],
    },
  });
  renderTokenUsageSummary({
    summary: {
      totalPrompts: 0,
      totalLlmCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCalls: 0,
      byProvider: [],
      byModel: [],
      daily: [],
    },
  });
  renderTokenUsagePrompts({ prompts: [], total: 0, limit: state.tokenUsage.limit, offset: 0 });
  renderSlackHitl(
    {
      configuredAdminChannel: null,
      channelFilter: null,
      summary: {
        total: 0,
        responded: 0,
        pending: 0,
        routeAdded: 0,
        approved: 0,
        dismissed: 0,
        rejected: 0,
        timedOut: 0,
        escalations: 0,
        routeLearning: 0,
        notifications: 0,
      },
    },
    []
  );
  await loadAll();
  await loadAdminChatHistory();
}

// ── Knowledge Editor ──────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const knowledgeState = {
  files: [],
  selectedPath: null,
  originalContent: null,
  dirty: false,
  collapsedFolders: new Set(),
};

function knowledgeEditorStatus(msg) {
  const el = $("knowledgeEditorStatus");
  if (el) el.textContent = msg;
}

// Build a nested tree object from a flat file list.
// Each node: { name, type:'folder'|'file', filePath?, children:{} }
function buildKnowledgeTree(files) {
  const root = { children: {} };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children[part]) {
        node.children[part] = { name: part, type: "folder", children: {} };
      }
      node = node.children[part];
    }
    const last = parts[parts.length - 1];
    node.children[last] = { name: f.name + ".md", type: "file", filePath: f.path };
  }
  return root;
}

// SVG icons (VS Code-ish)
const ICON_CHEVRON_RIGHT = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;transition:transform .15s" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHEVRON_DOWN  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_FOLDER_CLOSED = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--warning)" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5H12.5A1.5 1.5 0 0 1 14 6v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11V4.5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/></svg>`;
const ICON_FOLDER_OPEN   = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--warning)" aria-hidden="true"><path d="M2 5A1.5 1.5 0 0 1 3.5 3.5h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5v1H2V5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/><path d="M2 7.5h12l-1.5 5H3.5L2 7.5z" stroke="currentColor" stroke-width="1.4" fill="var(--warning-soft)"/></svg>`;
const ICON_FILE          = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--soft-muted)" aria-hidden="true"><path d="M4 2h5.5L12 4.5V14H4V2z" stroke="currentColor" stroke-width="1.4" fill="rgba(142,126,255,.12)"/><path d="M9.5 2v2.5H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

// Recursively render tree nodes into an HTML string.
// folderPath is the slash-joined path used as the collapse key.
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
      html += `
        <button
          class="ktree-folder"
          data-folder="${escHtml(childPath)}"
          style="
            display:flex;align-items:center;gap:5px;
            width:100%;text-align:left;
            padding:3px 8px 3px ${indent + 6}px;
            background:transparent;border:none;border-radius:4px;
            font-size:0.81rem;font-weight:500;
            color:var(--text);cursor:pointer;
            transition:background .1s;
          "
          title="${escHtml(childPath)}"
        >
          ${collapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN}
          ${collapsed ? ICON_FOLDER_CLOSED : ICON_FOLDER_OPEN}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(child.name)}</span>
        </button>`;
      if (!collapsed) {
        html += renderTreeNode(child, depth + 1, childPath);
      }
    } else {
      const active = child.filePath === knowledgeState.selectedPath;
      html += `
        <button
          class="ktree-file${active ? " active" : ""}"
          data-path="${escHtml(child.filePath)}"
          style="
            display:flex;align-items:center;gap:5px;
            width:100%;text-align:left;
            padding:3px 8px 3px ${indent + 18}px;
            background:${active ? "var(--accent-soft)" : "transparent"};
            border:none;border-radius:4px;
            font-size:0.81rem;
            color:${active ? "var(--accent-deep)" : "var(--text)"};
            font-weight:${active ? "600" : "400"};
            cursor:pointer;
            transition:background .1s;
          "
          title="${escHtml(child.filePath)}"
        >
          ${ICON_FILE}
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(child.name)}</span>
        </button>`;
    }
  }
  return html;
}

function renderKnowledgeFileList() {
  const container = $("knowledgeFileList");
  if (!container) return;

  if (!knowledgeState.files.length) {
    container.innerHTML = '<div class="empty-state" style="padding:1rem;">No .md files found.</div>';
    return;
  }

  const tree = buildKnowledgeTree(knowledgeState.files);
  container.innerHTML = `<div style="padding:4px 0">${renderTreeNode(tree, 0, "")}</div>`;

  // Folder toggle
  container.querySelectorAll(".ktree-folder").forEach((btn) => {
    btn.addEventListener("mouseenter", () => { btn.style.background = "var(--accent-soft)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    btn.addEventListener("click", () => {
      const fp = btn.dataset.folder;
      if (knowledgeState.collapsedFolders.has(fp)) {
        knowledgeState.collapsedFolders.delete(fp);
      } else {
        knowledgeState.collapsedFolders.add(fp);
      }
      renderKnowledgeFileList();
    });
  });

  // File select
  container.querySelectorAll(".ktree-file").forEach((btn) => {
    btn.addEventListener("mouseenter", () => {
      if (btn.dataset.path !== knowledgeState.selectedPath) {
        btn.style.background = "var(--accent-soft)";
        btn.style.opacity = "0.7";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (btn.dataset.path !== knowledgeState.selectedPath) {
        btn.style.background = "transparent";
        btn.style.opacity = "1";
      }
    });
    btn.addEventListener("click", () => selectKnowledgeFile(btn.dataset.path));
  });
}

async function selectKnowledgeFile(filePath) {
  if (knowledgeState.dirty) {
    const ok = confirm("You have unsaved changes. Discard them and open a new file?");
    if (!ok) return;
  }

  knowledgeState.selectedPath = filePath;
  knowledgeState.dirty = false;
  renderKnowledgeFileList();

  const textarea = $("knowledgeEditorTextarea");
  const meta = $("knowledgeEditorMeta");
  const saveBtn = $("knowledgeSaveBtn");

  textarea.disabled = true;
  textarea.value = "";
  if (saveBtn) saveBtn.disabled = true;
  if (meta) meta.innerHTML = `<span class="eyebrow subtle">Loading <code>${escHtml(filePath)}</code>…</span>`;
  knowledgeEditorStatus("");

  try {
    const data = await api(`/admin/knowledge/file?path=${encodeURIComponent(filePath)}`);
    textarea.value = data.content;
    knowledgeState.originalContent = data.content;
    textarea.disabled = false;
    if (meta) meta.innerHTML = `<code style="font-size:0.8rem;color:var(--accent-deep)">${escHtml(filePath)}</code>`;
    knowledgeEditorStatus("Loaded — edit and press Save to persist.");
  } catch (err) {
    knowledgeEditorStatus(`Error loading file: ${err.message}`);
    if (meta) meta.innerHTML = `<span class="eyebrow subtle" style="color:var(--danger)">Failed to load</span>`;
  }
}

async function saveKnowledgeFile() {
  const filePath = knowledgeState.selectedPath;
  const textarea = $("knowledgeEditorTextarea");
  const saveBtn = $("knowledgeSaveBtn");
  if (!filePath || !textarea) return;

  saveBtn.disabled = true;
  knowledgeEditorStatus("Saving…");

  try {
    await api("/admin/knowledge/file", {
      method: "PUT",
      body: JSON.stringify({ path: filePath, content: textarea.value }),
    });
    knowledgeState.originalContent = textarea.value;
    knowledgeState.dirty = false;
    saveBtn.disabled = true;
    knowledgeEditorStatus("Saved successfully.");
  } catch (err) {
    knowledgeEditorStatus(`Save failed: ${err.message}`);
    saveBtn.disabled = false;
  }
}

async function loadKnowledgeFiles() {
  const container = $("knowledgeFileList");
  if (container) container.innerHTML = '<div class="empty-state" style="padding:1rem;">Loading…</div>';
  try {
    const data = await api("/admin/knowledge/files");
    knowledgeState.files = data.files || [];
    renderKnowledgeFileList();
  } catch (err) {
    if (container) container.innerHTML = `<div class="empty-state" style="padding:1rem;color:var(--danger)">Error: ${escHtml(err.message)}</div>`;
  }
}

// Wire up save button
$("knowledgeSaveBtn")?.addEventListener("click", saveKnowledgeFile);

// Mark dirty on any edits
$("knowledgeEditorTextarea")?.addEventListener("input", () => {
  const saveBtn = $("knowledgeSaveBtn");
  const isDirty = $("knowledgeEditorTextarea").value !== knowledgeState.originalContent;
  knowledgeState.dirty = isDirty;
  if (saveBtn) saveBtn.disabled = !isDirty;
});

// Load files when switching to the knowledge page
// Auto-load knowledge files when navigating to the page
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#knowledge-editor" && !knowledgeState.files.length) {
    loadKnowledgeFiles();
  }
});

bootstrap().catch((err) => status(err.message));
