import type { Hono } from "hono";
import { brandStore, DEFAULT_SEEDED_BRAND_ID } from "../tenancy/brand-store.js";

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
}
