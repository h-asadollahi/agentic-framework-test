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
  llmUsageSummary: null,
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
    routes: "routesPage",
    activity: "activityPage",
    runs: "runsPage",
    slack: "slackPage",
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
  document.body.classList.add("modal-open");
}

function closeRouteModal() {
  const modal = $("routeModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
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

function tryParseJsonString(value) {
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

function renderBrandOptions(brands) {
  const select = $("adminChatBrand");
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
    setText("adminChatSevenDayCalls", "Unavailable");
    setText("adminChatTopProvider", "Unavailable");
    setText("adminChatScopeNote", errorMessage);
    return;
  }

  const summary = payload?.summary || {};
  const daily = Array.isArray(summary.daily) ? summary.daily : [];
  const latestDay = daily[daily.length - 1] || null;
  const byProvider = Array.isArray(summary.byProvider) ? summary.byProvider : [];
  const topProvider = byProvider[0] || null;

  setText("adminChatTodayTokens", latestDay ? humanizeCount(latestDay.tokens) : "0");
  setText("adminChatSevenDayTokens", humanizeCount(summary.totalTokens || 0));
  setText("adminChatSevenDayCalls", humanizeCount(summary.totalCalls || 0));
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
    loadSlackHitl(),
    loadAdminUsageSummary(),
  ]);
  status("Admin workspace loaded");
}

$("loadAll")?.addEventListener("click", () => loadAll().catch((err) => status(err.message)));
$("search")?.addEventListener("click", () => loadRoutes().catch((err) => status(err.message)));
$("routeModalClose")?.addEventListener("click", closeRouteModal);
$("routeModalBackdrop")?.addEventListener("click", closeRouteModal);
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
  renderAdminChatMessages();
  renderAdminUsageSummary({
    summary: { totalTokens: 0, totalCalls: 0, byProvider: [], daily: [] },
  });
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

bootstrap().catch((err) => status(err.message));
