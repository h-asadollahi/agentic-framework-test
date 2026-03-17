import { logger } from "../core/logger.js";
import { getPlatformDbRepository } from "../platform/db-repository.js";
import { parseGuardrailsFile, parseSoulFile } from "./brand-seed.js";
import type { BrandConfig } from "./brand-schema.js";

export const DEFAULT_SEEDED_BRAND_ID = "acme-marketing";

function buildSeedBrand(): BrandConfig {
  const brandIdentity = parseSoulFile();
  const guardrails = parseGuardrailsFile();
  const now = new Date().toISOString();

  return {
    id: DEFAULT_SEEDED_BRAND_ID,
    name: brandIdentity.name || "Acme Marketing",
    description: "Seeded from legacy knowledge/soul.md and knowledge/guardrails.md",
    brandIdentity,
    guardrails,
    channelRules: {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

class BrandStoreImpl {
  private loaded = false;
  private fallbackBrands: BrandConfig[] = [buildSeedBrand()];

  async load(): Promise<void> {
    if (this.loaded) return;

    const repo = getPlatformDbRepository();
    if (!repo) {
      this.loaded = true;
      return;
    }

    await repo.init();

    const count = await repo.countBrands();
    if (count === 0) {
      const seeded = buildSeedBrand();
      await repo.upsertBrand(seeded);
      logger.info("Seeded default brand into DB", {
        brandId: seeded.id,
        name: seeded.name,
      });
    }

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
