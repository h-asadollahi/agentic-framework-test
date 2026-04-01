import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { registerPublicRoutes } from "../../src/public/routes.js";
import { brandStore } from "../../src/tenancy/brand-store.js";

describe("public brand routes", () => {
  it("returns a marketer-safe list of active brands", async () => {
    vi.spyOn(brandStore, "listBrands").mockResolvedValue([
      {
        id: "acme-marketing",
        name: "Acme Marketing",
        description: "Default demo brand",
        brandIdentity: {
          name: "Acme Marketing",
          personality: [],
          values: [],
          voice: {
            tone: "professional",
            style: "concise",
            vocabulary: [],
            neverSay: [],
          },
          targetAudience: "",
          guidelines: "",
        },
        guardrails: {
          neverDo: [],
          alwaysDo: [],
          brandVoiceRules: [],
          contentPolicies: [],
        },
        channelRules: {},
        isActive: true,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "northline-fashion",
        name: "Northline Fashion",
        description: "Fashion test brand",
        brandIdentity: {
          name: "Northline Fashion",
          personality: [],
          values: [],
          voice: {
            tone: "polished",
            style: "concise",
            vocabulary: [],
            neverSay: [],
          },
          targetAudience: "",
          guidelines: "",
        },
        guardrails: {
          neverDo: ["Do not use neon colour families"],
          alwaysDo: [],
          brandVoiceRules: [],
          contentPolicies: [],
        },
        channelRules: {},
        isActive: false,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const app = new Hono();
    registerPublicRoutes(app);

    const response = await app.request("http://localhost/brands");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.defaultBrandId).toBe("acme-marketing");
    expect(body.brands).toEqual([
      {
        id: "acme-marketing",
        name: "Acme Marketing",
        description: "Default demo brand",
      },
    ]);
  });
});
