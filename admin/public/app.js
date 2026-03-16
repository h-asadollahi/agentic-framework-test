const $ = (id) => document.getElementById(id);

const state = {
  selectedRouteId: null,
  routes: [],
  routeCache: new Map(),
  health: null,
};

function status(text) {
  $("status").textContent = text;
}

function getHeaders() {
  const token = $("token").value.trim();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function api(path, options = {}) {
  const base = $("apiBase").value.trim().replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
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
  $(id).textContent = value;
}

function renderHealth(payload) {
  const stats = payload?.stats || {};
  const dbBacked = Boolean(payload?.dbBacked);
  const badge = $("sourceBadge");

  badge.textContent = dbBacked ? "DB" : "JSON";
  badge.className = `badge ${dbBacked ? "db" : "json"}`;

  setMetric("totalRoutes", String(stats.total ?? 0));
  setMetric("apiRoutes", String(stats.apiRoutes ?? 0));
  setMetric("subAgentRoutes", String(stats.subAgentRoutes ?? 0));
  setMetric("dualWriteState", stats.dualWriteJson ? "On" : "Off");

  $("sourceMeta").textContent = dbBacked
    ? "Live learned routes are currently being served from Postgres through the admin API."
    : "Admin API is currently using the JSON fallback for learned routes.";
}

function renderRouteDetails(route) {
  const summary = $("routeDetailSummary");
  const raw = $("routeRaw");

  if (!route) {
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
        <dd>${escapeHtml(route.routeType === "api" ? "Endpoint/API workflow" : "Sub-agent dispatch")}</dd>
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
        <dd>${escapeHtml(Object.keys(route.endpoint?.queryParams || {}).length > 0 ? Object.keys(route.endpoint.queryParams).join(", ") : "None")}</dd>
        <dt>Headers</dt>
        <dd>${escapeHtml(Object.keys(route.endpoint?.headers || {}).length > 0 ? Object.keys(route.endpoint.headers).join(", ") : "None")}</dd>
      </dl>
    </div>
  `;

  raw.textContent = JSON.stringify(route, null, 2);
}

function renderRoutes(routes) {
  const tbody = $("routesTable");
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
        <button class="secondary" data-view="${escapeHtml(route.id)}">Inspect</button>
        <button class="danger" data-delete="${escapeHtml(route.id)}">Delete</button>
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
        }
        await loadAll();
        status(`Deleted ${routeId}`);
      } catch (err) {
        status(`Delete failed: ${err.message}`);
      }
    });
  });
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

  if (!options.silent) {
    status(`Loaded ${routeId}`);
  }
}

async function loadRoutes() {
  const q = $("query").value.trim();
  const routeType = $("routeType").value;
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
    return;
  }

  const activeRouteId = state.routes.some((route) => route.id === state.selectedRouteId)
    ? state.selectedRouteId
    : state.routes[0].id;

  await loadRouteDetails(activeRouteId, { silent: true });
}

async function loadEvents() {
  const data = await api("/admin/events?limit=40");
  $("events").textContent = JSON.stringify(data.events || [], null, 2);
}

async function loadRuns() {
  const data = await api("/admin/runs/summary?limit=20");
  $("runs").textContent = JSON.stringify(data, null, 2);
}

async function loadAll() {
  status("Loading admin data...");
  await Promise.all([loadHealth(), loadRoutes(), loadEvents(), loadRuns()]);
  status("Admin data loaded");
}

$("loadAll").addEventListener("click", () => loadAll().catch((err) => status(err.message)));
$("search").addEventListener("click", () => loadRoutes().catch((err) => status(err.message)));

$("importBtn").addEventListener("click", async () => {
  try {
    status("Backfilling JSON -> DB...");
    const data = await api("/admin/backfill/import", { method: "POST", body: "{}" });
    status(`Imported ${data.imported}, skipped ${data.skipped}`);
    await loadAll();
  } catch (err) {
    status(`Backfill failed: ${err.message}`);
  }
});

$("exportBtn").addEventListener("click", async () => {
  try {
    status("Exporting DB -> JSON...");
    const data = await api("/admin/backfill/export", { method: "POST", body: "{}" });
    status(`Exported ${data.exported} routes`);
  } catch (err) {
    status(`Export failed: ${err.message}`);
  }
});

loadAll().catch((err) => status(err.message));
