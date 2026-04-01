import type { Hono } from "hono";
import { brandStore, DEFAULT_SEEDED_BRAND_ID } from "../tenancy/brand-store.js";
import { listBrandFiles, readBrandFile, writeBrandFile } from "../admin/knowledge-fs.js";

export function registerPublicRoutes(app: Hono): void {
  app.get("/brands", async (c) => {
    const brands = await brandStore.listBrands();

    return c.json({
      defaultBrandId: DEFAULT_SEEDED_BRAND_ID,
      brands: brands
        .filter((brand) => brand.isActive)
        .map((brand) => ({
          id: brand.id,
          name: brand.name,
          description: brand.description,
        })),
    });
  });

  // ── Brand-scoped knowledge routes (marketer-facing) ───────────────────────
  // Access is restricted to knowledge/brands/{brandId}/ — no cross-brand access.

  app.get("/brands/:brandId/knowledge/files", async (c) => {
    const brandId = c.req.param("brandId");
    try {
      const files = await listBrandFiles(brandId);
      return c.json({ brandId, files });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json({ error: msg }, msg.includes("invalid") ? 400 : 500);
    }
  });

  app.get("/brands/:brandId/knowledge/file", async (c) => {
    const brandId = c.req.param("brandId");
    const filePath = c.req.query("path");
    if (!filePath) {
      return c.json({ error: "Missing required query param: path" }, 400);
    }
    try {
      const content = await readBrandFile(brandId, filePath);
      return c.json({ brandId, path: filePath, content });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isNotFound = msg.includes("not found") || msg.includes("ENOENT");
      return c.json({ error: msg }, isNotFound ? 404 : 400);
    }
  });

  app.put("/brands/:brandId/knowledge/file", async (c) => {
    const brandId = c.req.param("brandId");
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.path !== "string" || typeof body.content !== "string") {
      return c.json({ error: "Body must be { path: string, content: string }" }, 400);
    }
    try {
      await writeBrandFile(brandId, body.path, body.content);
      return c.json({ ok: true, brandId, path: body.path });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isNotFound = msg.includes("not found") || msg.includes("ENOENT");
      return c.json({ error: msg }, isNotFound ? 404 : 400);
    }
  });
}
