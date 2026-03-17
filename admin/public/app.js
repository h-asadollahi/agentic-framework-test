const $ = (id) => document.getElementById(id);

const state = {
  currentPage: "dashboard",
  selectedRouteId: null,
  routes: [],
  routeCache: new Map(),
  health: null,
  config: null,
  events: [],
  runSummary: null,
  slackSummary: null,
  slackMessages: [],
};

const pageConfig = {
  "#dashboard": {
    page: "dashboard",
    scrollTarget: "dashboard",
    navHash: "#dashboard",
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
    loadHealth(),
    loadRoutes(),
    loadEvents(),
    loadRuns(),
    loadSlackHitl(),
  ]);
  status("Admin workspace loaded");
}

$("loadAll")?.addEventListener("click", () => loadAll().catch((err) => status(err.message)));
$("search")?.addEventListener("click", () => loadRoutes().catch((err) => status(err.message)));
$("routeModalClose")?.addEventListener("click", closeRouteModal);
$("routeModalBackdrop")?.addEventListener("click", closeRouteModal);

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
  renderRouteDetails(null);
  renderEvents([]);
  renderRuns({ total: 0, byStatus: {}, latest: [] });
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
}

bootstrap().catch((err) => status(err.message));
