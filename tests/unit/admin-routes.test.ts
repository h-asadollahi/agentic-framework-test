import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerAdminRoutes } from "../../src/admin/routes.js";
import { learnedRoutesStore } from "../../src/routing/learned-routes-store.js";

const routesFile = resolve(process.cwd(), "knowledge/learned-routes.json");
const initialRoutesFile =
  JSON.stringify(
    {
      version: "1.0.0",
      lastUpdated: "2026-03-10T00:00:00.000Z",
      routes: [],
    },
    null,
    2
  ) + "\n";

const originalAllowedIps = process.env.ADMIN_ALLOWED_IPS;
const originalToken = process.env.ADMIN_API_TOKEN;
const originalDatabaseUrl = process.env.DATABASE_URL;

let backupContent: string | null = null;
let backupExisted = false;

function buildApp(): Hono {
  const app = new Hono();
  registerAdminRoutes(app);
  return app;
}

describe.sequential("admin routes", () => {
  beforeAll(() => {
    backupExisted = existsSync(routesFile);
    backupContent = backupExisted ? readFileSync(routesFile, "utf-8") : null;
  });

  beforeEach(async () => {
    writeFileSync(routesFile, initialRoutesFile, "utf-8");
    process.env.ADMIN_ALLOWED_IPS = "";
    process.env.ADMIN_API_TOKEN = "admin-token";
    delete process.env.DATABASE_URL;
    await learnedRoutesStore.load();
  });

  afterAll(() => {
    process.env.ADMIN_ALLOWED_IPS = originalAllowedIps;
    process.env.ADMIN_API_TOKEN = originalToken;
    process.env.DATABASE_URL = originalDatabaseUrl;

    if (backupExisted && backupContent !== null) {
      writeFileSync(routesFile, backupContent, "utf-8");
      return;
    }
    writeFileSync(routesFile, initialRoutesFile, "utf-8");
  });

  it("protects admin endpoints by token", async () => {
    const app = buildApp();
    const unauthorized = await app.request("http://localhost/admin/health");
    expect(unauthorized.status).toBe(403);

    const authorized = await app.request("http://localhost/admin/health", {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(authorized.status).toBe(200);
  });

  it("supports route CRUD and timeline/run observability endpoints", async () => {
    const app = buildApp();
    const headers = { Authorization: "Bearer admin-token" };

    const createResponse = await app.request("http://localhost/admin/routes", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        capability: "vip-cohort-observability",
        description: "Track VIP cohort performance route",
        matchPatterns: ["vip cohort", "cohort performance"],
        routeType: "sub-agent",
        agentId: "cohort-monitor",
        addedBy: "admin-test",
      }),
    });

    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    expect(createdBody.route.id).toBe("route-001");

    const listResponse = await app.request("http://localhost/admin/routes", {
      headers,
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(Array.isArray(listBody.routes)).toBe(true);
    expect(listBody.routes).toHaveLength(1);

    const eventsResponse = await app.request("http://localhost/admin/events", {
      headers,
    });
    expect(eventsResponse.status).toBe(200);
    const eventsBody = await eventsResponse.json();
    expect(Array.isArray(eventsBody.events)).toBe(true);

    const runSummaryResponse = await app.request(
      "http://localhost/admin/runs/summary",
      { headers }
    );
    expect(runSummaryResponse.status).toBe(200);

    const deleteResponse = await app.request(
      "http://localhost/admin/routes/route-001",
      {
        method: "DELETE",
        headers,
      }
    );
    expect(deleteResponse.status).toBe(200);
  });
});

