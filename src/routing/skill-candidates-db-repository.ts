import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { SkillCandidateSchema, type SkillCandidate } from "./skill-candidates-schema.js";
import { skillCandidatesTable } from "./learned-routes-db-schema.js";
import { logger } from "../core/logger.js";

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toSkillCandidateRow(candidate: SkillCandidate) {
  return {
    id: candidate.id,
    capability: candidate.capability,
    description: candidate.description,
    audience: candidate.audience,
    scope: candidate.scope,
    brandId: normalizeNullableString(candidate.brandId),
    suggestedSkillFile: candidate.suggestedSkillFile,
    triggerPatterns: candidate.triggerPatterns,
    confidence: candidate.confidence,
    requiresApproval: candidate.requiresApproval,
    source: candidate.source,
    addedAt: new Date(candidate.addedAt),
    lastUsedAt: candidate.lastUsedAt ? new Date(candidate.lastUsedAt) : null,
    usageCount: candidate.usageCount,
    updatedAt: new Date(),
  };
}

function fromSkillCandidateRow(
  row: typeof skillCandidatesTable.$inferSelect
): SkillCandidate {
  return SkillCandidateSchema.parse({
    id: row.id,
    capability: row.capability,
    description: row.description,
    audience: row.audience,
    scope: row.scope,
    brandId: normalizeNullableString(row.brandId),
    suggestedSkillFile: row.suggestedSkillFile,
    triggerPatterns: Array.isArray(row.triggerPatterns) ? row.triggerPatterns : [],
    confidence: row.confidence,
    requiresApproval: row.requiresApproval,
    source: row.source,
    addedAt: toIsoString(row.addedAt),
    lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
    usageCount: row.usageCount ?? 0,
  });
}

export class SkillCandidatesDbRepository {
  private readonly pool: Pool;
  private readonly db: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool);
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS skill_candidates (
        id TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        description TEXT NOT NULL,
        audience TEXT NOT NULL DEFAULT 'marketer',
        scope TEXT NOT NULL DEFAULT 'global',
        brand_id TEXT,
        suggested_skill_file TEXT NOT NULL,
        trigger_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
        confidence TEXT NOT NULL DEFAULT 'medium',
        requires_approval BOOLEAN NOT NULL DEFAULT false,
        source TEXT NOT NULL DEFAULT 'agency',
        added_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS skill_candidates_capability_idx
      ON skill_candidates (capability);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS skill_candidates_audience_scope_idx
      ON skill_candidates (audience, scope);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS skill_candidates_brand_scope_idx
      ON skill_candidates (brand_id, scope);
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS skill_candidates_usage_count_idx
      ON skill_candidates (usage_count DESC);
    `);

    logger.debug("SkillCandidatesDbRepository initialized");
  }

  async upsertSkill(candidate: SkillCandidate): Promise<void> {
    const row = toSkillCandidateRow(candidate);
    await this.db
      .insert(skillCandidatesTable)
      .values(row)
      .onConflictDoUpdate({
        target: skillCandidatesTable.id,
        set: {
          capability: row.capability,
          description: row.description,
          audience: row.audience,
          scope: row.scope,
          brandId: row.brandId,
          suggestedSkillFile: row.suggestedSkillFile,
          triggerPatterns: row.triggerPatterns,
          confidence: row.confidence,
          requiresApproval: row.requiresApproval,
          source: row.source,
          addedAt: row.addedAt,
          lastUsedAt: row.lastUsedAt,
          usageCount: row.usageCount,
          updatedAt: new Date(),
        },
      });
  }

  async incrementUsage(candidateId: string): Promise<void> {
    await this.db
      .update(skillCandidatesTable)
      .set({
        usageCount: sql`${skillCandidatesTable.usageCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(skillCandidatesTable.id, candidateId));
  }

  async getAll(): Promise<SkillCandidate[]> {
    const rows = await this.db
      .select()
      .from(skillCandidatesTable)
      .orderBy(desc(skillCandidatesTable.usageCount))
      .limit(5000);
    return rows.map(fromSkillCandidateRow);
  }

  async getAllForContext(options: {
    audience?: string;
    scope?: string;
    brandId?: string | null;
  }): Promise<SkillCandidate[]> {
    const conditions = [];
    if (options.audience) {
      conditions.push(eq(skillCandidatesTable.audience, options.audience));
    }
    if (options.scope) {
      conditions.push(eq(skillCandidatesTable.scope, options.scope));
    }
    if (options.brandId !== undefined) {
      if (options.brandId === null) {
        conditions.push(eq(skillCandidatesTable.scope, "global"));
      } else {
        conditions.push(eq(skillCandidatesTable.brandId, options.brandId));
      }
    }

    const rows = await this.db
      .select()
      .from(skillCandidatesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(skillCandidatesTable.usageCount))
      .limit(5000);

    return rows.map(fromSkillCandidateRow);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
