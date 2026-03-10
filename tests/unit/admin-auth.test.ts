import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createAdminAuthMiddleware } from "../../src/admin/auth.js";

const originalAllowedIps = process.env.ADMIN_ALLOWED_IPS;
const originalApiToken = process.env.ADMIN_API_TOKEN;

afterEach(() => {
  process.env.ADMIN_ALLOWED_IPS = originalAllowedIps;
  process.env.ADMIN_API_TOKEN = originalApiToken;
});

function buildApp(): Hono {
  const app = new Hono();
  app.use("/admin/*", createAdminAuthMiddleware());
  app.get("/admin/test", (c) => c.json({ ok: true }));
  return app;
}

describe("admin auth middleware", () => {
  it("allows token-authenticated requests", async () => {
    process.env.ADMIN_ALLOWED_IPS = "";
    process.env.ADMIN_API_TOKEN = "secret-token";
    const app = buildApp();

    const response = await app.request("http://localhost/admin/test", {
      headers: { Authorization: "Bearer secret-token" },
    });

    expect(response.status).toBe(200);
  });

  it("rejects invalid token", async () => {
    process.env.ADMIN_ALLOWED_IPS = "";
    process.env.ADMIN_API_TOKEN = "secret-token";
    const app = buildApp();

    const response = await app.request("http://localhost/admin/test", {
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(response.status).toBe(403);
  });

  it("allows request from allowlisted IP without token", async () => {
    process.env.ADMIN_ALLOWED_IPS = "127.0.0.1,::1";
    delete process.env.ADMIN_API_TOKEN;
    const app = buildApp();

    const response = await app.request("http://localhost/admin/test", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });

    expect(response.status).toBe(200);
  });

  it("rejects when no admin auth config exists", async () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    delete process.env.ADMIN_API_TOKEN;
    const app = buildApp();

    const response = await app.request("http://localhost/admin/test");
    expect(response.status).toBe(403);
  });
});

