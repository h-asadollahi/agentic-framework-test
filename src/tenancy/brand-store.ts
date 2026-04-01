import { logger } from "../core/logger.js";
import { getPlatformDbRepository } from "../platform/db-repository.js";
import { parseMergedGuardrailsFile, parseSoulFile } from "./brand-seed.js";
import type { BrandConfig } from "./brand-schema.js";

export const DEFAULT_SEEDED_BRAND_ID = "acme-marketing";
export const NORTHLINE_FASHION_BRAND_ID = "northline-fashion";

function buildSeedBrand(options?: {
  id?: string;
  defaultName?: string;
  description?: string;
  soulFilePath?: string;
  guardrailsFilePath?: string;
}): BrandConfig {
  const brandIdentity = parseSoulFile(options?.soulFilePath);
  const guardrails = parseMergedGuardrailsFile({
    extensionFilePath: options?.guardrailsFilePath,
  });
  const now = new Date().toISOString();

  return {
    id: options?.id ?? DEFAULT_SEEDED_BRAND_ID,
    name: brandIdentity.name || options?.defaultName || "Brand",
    description:
      options?.description ??
      "Seeded from legacy knowledge/soul.md and knowledge/guardrails.md",
    brandIdentity,
    guardrails,
    channelRules: {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSeedBrands(): BrandConfig[] {
  return [
    buildSeedBrand({
      id: DEFAULT_SEEDED_BRAND_ID,
      defaultName: "Acme Marketing",
      description: "Seeded from legacy knowledge/soul.md and knowledge/guardrails.md",
    }),
    buildSeedBrand({
      id: NORTHLINE_FASHION_BRAND_ID,
      defaultName: "Northline Fashion",
      description:
        "Seeded from knowledge/brands/northline-fashion with shared global guardrails.",
      soulFilePath: "knowledge/brands/northline-fashion/soul.md",
      guardrailsFilePath: "knowledge/brands/northline-fashion/guardrails.md",
    }),
  ];
}

export async function syncSeedBrands(
  repo: Pick<
    NonNullable<ReturnType<typeof getPlatformDbRepository>>,
    "getBrandById" | "upsertBrand"
  >,
  seededBrands: BrandConfig[] = buildSeedBrands()
): Promise<void> {
  for (const brand of seededBrands) {
    const existing = await repo.getBrandById(brand.id);
    if (existing) continue;
    await repo.upsertBrand(brand);
    logger.info("Seeded brand into DB", {
      brandId: brand.id,
      name: brand.name,
    });
  }
}

class BrandStoreImpl {
  private loaded = false;
  private fallbackBrands: BrandConfig[] = buildSeedBrands();

  async load(): Promise<void> {
    if (this.loaded) return;

    const repo = getPlatformDbRepository();
    if (!repo) {
      this.loaded = true;
      return;
    }

    await repo.init();
    await syncSeedBrands(repo);

    this.loaded = true;
  }

  async listBrands(): Promise<BrandConfig[]> {
    await this.load();
    const repo = getPlatformDbRepository();
    if (!repo) {
      return [...this.fallbackBrands];
    }
    return repo.listBrands();
  }

  async getBrandById(brandId: string): Promise<BrandConfig | null> {
    await this.load();
    const repo = getPlatformDbRepository();
    if (!repo) {
      return this.fallbackBrands.find((brand) => brand.id === brandId) ?? null;
    }
    return repo.getBrandById(brandId);
  }

  async upsertBrand(brand: BrandConfig): Promise<BrandConfig> {
    await this.load();
    const repo = getPlatformDbRepository();
    if (!repo) {
      const existingIndex = this.fallbackBrands.findIndex((item) => item.id === brand.id);
      if (existingIndex >= 0) {
        this.fallbackBrands[existingIndex] = brand;
      } else {
        this.fallbackBrands.push(brand);
      }
      return brand;
    }
    return repo.upsertBrand(brand);
  }

  async assertBrandExists(brandId: string): Promise<void> {
    const brand = await this.getBrandById(brandId);
    if (!brand) {
      throw new Error(`Unknown brandId "${brandId}"`);
    }
  }
}

export const brandStore = new BrandStoreImpl();
