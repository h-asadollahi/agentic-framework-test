const $ = (id) => document.getElementById(id);

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

function renderRoutes(routes) {
  const tbody = $("routesTable");
  tbody.innerHTML = "";

  for (const route of routes) {
    const tr = document.createElement("tr");
    const target = route.routeType === "api" ? route.endpoint?.url || "-" : route.agentId || "-";

    tr.innerHTML = `
      <td>${route.id}</td>
      <td>
        <div><strong>${route.capability}</strong></div>
        <div class="muted">${route.description}</div>
      </td>
      <td>${route.routeType}</td>
      <td>${route.usageCount ?? 0}</td>
      <td><pre>${target}</pre></td>
      <td><button class="danger" data-delete="${route.id}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const routeId = btn.getAttribute("data-delete");
      if (!routeId) return;
      if (!confirm(`Delete ${routeId}?`)) return;
      try {
        status(`Deleting ${routeId}...`);
        await api(`/admin/routes/${routeId}`, { method: "DELETE" });
        await loadAll();
        status(`Deleted ${routeId}`);
      } catch (err) {
        status(`Delete failed: ${err.message}`);
      }
    });
  });
}

async function loadRoutes() {
  const q = $("query").value.trim();
  const routeType = $("routeType").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (routeType) params.set("routeType", routeType);
  const data = await api(`/admin/routes?${params.toString()}`);
  renderRoutes(data.routes || []);
  $("stats").textContent = JSON.stringify(data.stats || {}, null, 2);
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
  status("Loading...");
  await Promise.all([loadRoutes(), loadEvents(), loadRuns()]);
  status("Loaded");
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
