import { describe, expect, it, vi } from "vitest";
import { buildSeedBrands, syncSeedBrands } from "../../src/tenancy/brand-store.js";
import { parseMergedGuardrailsFile } from "../../src/tenancy/brand-seed.js";

describe("brand store seeding", () => {
  it("builds both seeded brands for fallback mode", () => {
    const brands = buildSeedBrands();

    expect(brands.map((brand) => brand.id)).toEqual([
      "acme-marketing",
      "northline-fashion",
    ]);
  });

  it("merges global and northline-specific guardrails", () => {
    const merged = parseMergedGuardrailsFile({
      extensionFilePath: "knowledge/brands/northline-fashion/guardrails.md",
    });

    expect(merged.alwaysDo).toContain("Always include data sources when citing statistics");
    expect(merged.alwaysDo).toContain(
      "Silhouette must remain within: straight_cut, softly_tailored"
    );
    expect(merged.neverDo).toContain("Do not use neon colour families");
  });

  it("inserts only missing seeded brands during DB sync", async () => {
    const seededBrands = buildSeedBrands();
    const getBrandById = vi.fn(async (brandId: string) =>
      brandId === "acme-marketing" ? seededBrands[0] : null
    );
    const upsertBrand = vi.fn(async (brand) => brand);

    await syncSeedBrands({ getBrandById, upsertBrand }, seededBrands);

    expect(getBrandById).toHaveBeenCalledTimes(2);
    expect(upsertBrand).toHaveBeenCalledTimes(1);
    expect(upsertBrand).toHaveBeenCalledWith(
      expect.objectContaining({ id: "northline-fashion" })
    );
  });
});
