import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tasks } from "@trigger.dev/sdk/v3";
import { registerAdminRoutes } from "../../src/admin/routes.js";
import { llmUsageStore } from "../../src/observability/llm-usage-store.js";
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
const originalTriggerApiUrl = process.env.TRIGGER_API_URL;
const originalTriggerSecretKey = process.env.TRIGGER_SECRET_KEY;
const originalSlackAdminHitlChannel = process.env.SLACK_ADMIN_HITL_CHANNEL;

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
    delete process.env.TRIGGER_API_URL;
    delete process.env.TRIGGER_SECRET_KEY;
    process.env.SLACK_ADMIN_HITL_CHANNEL = "brand-cp-admin-hitl";
    await learnedRoutesStore.load();
  });

  afterEach(() => {
    process.env.TRIGGER_API_URL = originalTriggerApiUrl;
    process.env.TRIGGER_SECRET_KEY = originalTriggerSecretKey;
    vi.restoreAllMocks();
  });

  afterAll(() => {
    process.env.ADMIN_ALLOWED_IPS = originalAllowedIps;
    process.env.ADMIN_API_TOKEN = originalToken;
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.TRIGGER_API_URL = originalTriggerApiUrl;
    process.env.TRIGGER_SECRET_KEY = originalTriggerSecretKey;
    process.env.SLACK_ADMIN_HITL_CHANNEL = originalSlackAdminHitlChannel;

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

  it("uses Trigger's v1 run list endpoint for admin run summaries", async () => {
    process.env.TRIGGER_API_URL = "http://trigger.local";
    process.env.TRIGGER_SECRET_KEY = "trigger-secret";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "run-123",
              status: "COMPLETED",
              taskIdentifier: "orchestrate-pipeline",
              createdAt: "2026-03-17T09:00:00.000Z",
              finishedAt: "2026-03-17T09:00:10.000Z",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const app = buildApp();
    const response = await app.request(
      "http://localhost/admin/runs/summary?limit=7",
      { headers: { Authorization: "Bearer admin-token" } }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://trigger.local/api/v1/runs?page%5Bsize%5D=7",
      {
        headers: { Authorization: "Bearer trigger-secret" },
      }
    );

    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.byStatus).toEqual({ COMPLETED: 1 });
    expect(body.latest).toEqual([
      {
        id: "run-123",
        status: "COMPLETED",
        taskIdentifier: "orchestrate-pipeline",
        createdAt: "2026-03-17T09:00:00.000Z",
        finishedAt: "2026-03-17T09:00:10.000Z",
      },
    ]);
  });

  it("returns Slack HITL counters and latest messages scoped to the admin channel", async () => {
    const summarySpy = vi
      .spyOn(learnedRoutesStore, "getSlackHitlSummaryForAdmin")
      .mockResolvedValue({
        total: 4,
        responded: 3,
        pending: 1,
        routeAdded: 2,
        approved: 1,
        rejected: 1,
        timedOut: 1,
        escalations: 2,
        routeLearning: 2,
        notifications: 1,
      });

    const messagesSpy = vi
      .spyOn(learnedRoutesStore, "listSlackHitlThreadsForAdmin")
      .mockResolvedValue([
        {
          id: 1,
          kind: "route-learning",
          channel: "brand-cp-admin-hitl",
          messageTs: "1710672000.000100",
          threadTs: "1710672000.000100",
          status: "route_added",
          taskDescription: "Need a route for CLV contribution by segment",
          reason: null,
          severity: null,
          runId: "run-1",
          agentId: "general",
          routeId: "route-010",
          respondedBy: "U123",
          responseText: "URL: https://api.example.com/clv",
          addedRouteId: "route-010",
          metadata: { timeoutMinutes: 30 },
          respondedAt: "2026-03-17T09:00:00.000Z",
          resolvedAt: "2026-03-17T09:05:00.000Z",
          createdAt: "2026-03-17T08:55:00.000Z",
          updatedAt: "2026-03-17T09:05:00.000Z",
        },
      ]);

    const app = buildApp();
    const headers = { Authorization: "Bearer admin-token" };

    const summaryResponse = await app.request("http://localhost/admin/slack/summary", {
      headers,
    });
    expect(summaryResponse.status).toBe(200);
    expect(summarySpy).toHaveBeenCalledWith({
      channel: "brand-cp-admin-hitl",
      kind: undefined,
    });

    const summaryBody = await summaryResponse.json();
    expect(summaryBody.configuredAdminChannel).toBe("brand-cp-admin-hitl");
    expect(summaryBody.channelFilter).toBe("brand-cp-admin-hitl");
    expect(summaryBody.summary).toMatchObject({
      total: 4,
      responded: 3,
      routeAdded: 2,
      approved: 1,
    });

    const messagesResponse = await app.request(
      "http://localhost/admin/slack/messages?limit=5",
      { headers }
    );
    expect(messagesResponse.status).toBe(200);
    expect(messagesSpy).toHaveBeenCalledWith({
      channel: "brand-cp-admin-hitl",
      kind: undefined,
      status: undefined,
      limit: 5,
      offset: 0,
    });

    const messagesBody = await messagesResponse.json();
    expect(messagesBody.messages).toHaveLength(1);
    expect(messagesBody.messages[0]).toMatchObject({
      kind: "route-learning",
      status: "route_added",
      addedRouteId: "route-010",
    });
  });

  it("lists brands and returns scoped LLM usage summaries", async () => {
    const usageSpy = vi.spyOn(llmUsageStore, "getSummary").mockResolvedValue({
      totalTokens: 4200,
      totalCalls: 21,
      byProvider: [{ provider: "openai", tokens: 4200, calls: 21 }],
      byModel: [{ model: "openai:gpt-5.4-mini", tokens: 4200, calls: 21 }],
      daily: [{ bucket: "2026-03-17", tokens: 4200, calls: 21 }],
    });

    const app = buildApp();
    const headers = { Authorization: "Bearer admin-token" };

    const brandsResponse = await app.request("http://localhost/admin/brands", {
      headers,
    });
    expect(brandsResponse.status).toBe(200);
    const brandsBody = await brandsResponse.json();
    expect(brandsBody.defaultBrandId).toBe("acme-marketing");
    expect(Array.isArray(brandsBody.brands)).toBe(true);
    expect(brandsBody.brands[0].id).toBe("acme-marketing");

    const usageResponse = await app.request(
      "http://localhost/admin/llm-usage/summary?audience=marketer&brandId=acme-marketing&days=14",
      { headers }
    );
    expect(usageResponse.status).toBe(200);
    expect(usageSpy).toHaveBeenCalledWith({
      audience: "marketer",
      brandId: "acme-marketing",
      days: 14,
    });
  });

  it("starts admin chat runs, stores session history, and proxies admin chat status", async () => {
    const triggerSpy = vi
      .spyOn(tasks, "trigger")
      .mockResolvedValue({ id: "run-admin-1" } as Awaited<ReturnType<typeof tasks.trigger>>);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "run-admin-1",
          status: "COMPLETED",
          output: {
            formattedResponse: "Admin response",
            notifications: [],
            trace: [],
          },
          createdAt: "2026-03-17T10:00:00.000Z",
          updatedAt: "2026-03-17T10:00:02.000Z",
          finishedAt: "2026-03-17T10:00:02.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    process.env.TRIGGER_API_URL = "http://trigger.local";
    process.env.TRIGGER_SECRET_KEY = "trigger-secret";

    const app = buildApp();
    const headers = {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    };

    const chatResponse = await app.request("http://localhost/admin/chat/message", {
      method: "POST",
      headers,
      body: JSON.stringify({
        userMessage: "Give me the daily token usage across all the LLMs used for this project by marketers.",
        brandId: "acme-marketing",
      }),
    });

    expect(chatResponse.status).toBe(200);
    const chatBody = await chatResponse.json();
    expect(chatBody.runId).toBe("run-admin-1");
    expect(chatBody.brandId).toBe("acme-marketing");
    expect(triggerSpy).toHaveBeenCalledTimes(1);

    const historyResponse = await app.request(
      `http://localhost/admin/chat/session/${chatBody.sessionId}/history`,
      { headers: { Authorization: "Bearer admin-token" } }
    );
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    expect(historyBody.messages).toHaveLength(1);
    expect(historyBody.messages[0]).toMatchObject({
      role: "user",
    });

    const statusResponse = await app.request(
      "http://localhost/admin/chat/status/run-admin-1",
      { headers: { Authorization: "Bearer admin-token" } }
    );
    expect(statusResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://trigger.local/api/v3/runs/run-admin-1",
      {
        headers: { Authorization: "Bearer trigger-secret" },
      }
    );
  });
});
