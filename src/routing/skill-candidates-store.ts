import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../core/logger.js";
import { allowsAudience } from "../core/request-context.js";
import type { CapabilityAudience, RequestContext, RequestScope } from "../core/types.js";
import {
  SkillCandidatesFileSchema,
  type SkillCandidate,
  type SkillCandidatesFile,
} from "./skill-candidates-schema.js";
import { getSkillCandidatesDbRepository } from "../platform/db-repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    const hasPackageJson = existsSync(join(current, "package.json"));
    const hasKnowledgeDir = existsSync(join(current, "knowledge"));
    if (hasPackageJson && hasKnowledgeDir) return current;

    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

const PROJECT_ROOT =
  findProjectRoot(process.cwd()) ??
  findProjectRoot(__dirname) ??
  resolve(__dirname, "../..");
const SKILL_CANDIDATES_FILE = resolve(
  PROJECT_ROOT,
  "knowledge/skill-candidates.json"
);

const CONFIDENCE_RANK: Record<SkillCandidate["confidence"], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function skillFileExists(relativePath: string): boolean {
  const absolute = resolve(PROJECT_ROOT, relativePath);
  return existsSync(absolute);
}

function normalizePatterns(patterns: string[]): string[] {
  const deduped = new Set(
    patterns
      .map((pattern) => pattern.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20)
  );
  return [...deduped];
}

function normalizeSuggestedSkillFilePath(rawPath: string): string {
  const fallback = "skills/learned/new-agent-skill.md";
  const trimmed = rawPath.trim();
  const sanitized = (trimmed.length > 0 ? trimmed : fallback)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");

  const withExtension = sanitized.toLowerCase().endsWith(".md")
    ? sanitized
    : `${sanitized}.md`;

  if (withExtension.startsWith("skills/learned/")) {
    return withExtension;
  }

  const fileName = withExtension.split("/").pop() || "new-agent-skill.md";
  return `skills/learned/${fileName}`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function tokenOverlapScore(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap;
}

function extractSkillFileStem(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? normalized;
  return fileName.replace(/\.md$/i, "");
}

function hasTriggerPatternSimilarity(
  existingPatterns: string[],
  incomingPatterns: string[]
): boolean {
  const normalizedExisting = normalizePatterns(existingPatterns);
  const normalizedIncoming = normalizePatterns(incomingPatterns);

  if (normalizedExisting.length === 0 || normalizedIncoming.length === 0) {
    return false;
  }

  const existingSet = new Set(normalizedExisting);
  for (const pattern of normalizedIncoming) {
    if (existingSet.has(pattern)) {
      return true;
    }
  }

  for (const existing of normalizedExisting) {
    for (const incoming of normalizedIncoming) {
      if (tokenOverlapScore(existing, incoming) >= 3) {
        return true;
      }
    }
  }

  return false;
}

function nextCandidateId(candidates: SkillCandidate[]): string {
  return `skill-${String(candidates.length + 1).padStart(3, "0")}`;
}

function isDualWriteJsonEnabled(): boolean {
  return ["1", "true", "yes"].includes(
    (process.env.SKILL_CANDIDATES_DUAL_WRITE_JSON ?? "").toLowerCase()
  );
}

class SkillCandidatesStoreImpl {
  private candidates: SkillCandidate[] = [];
  private loaded = false;
  private dbEnabled = false;

  async load(): Promise<void> {
    const repo = getSkillCandidatesDbRepository();
    if (!repo) {
      this.loadFromJsonSync();
      return;
    }

    try {
      await repo.init();
      this.candidates = await repo.getAll();
      this.loaded = true;
      this.dbEnabled = true;
      logger.info(`Loaded ${this.candidates.length} skill candidate(s) from DB`);
      if (isDualWriteJsonEnabled()) {
        this.saveToJsonSync();
      }
    } catch (error) {
      logger.error("Skill candidates DB load failed, falling back to JSON", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.loadFromJsonSync();
    }
  }

  private loadFromJsonSync(): void {
    if (!existsSync(SKILL_CANDIDATES_FILE)) {
      this.candidates = [];
      this.loaded = true;
      logger.info("No skill-candidates.json found, starting with empty list");
      return;
    }

    try {
      const raw = readFileSync(SKILL_CANDIDATES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const validated = SkillCandidatesFileSchema.parse(parsed);
      this.candidates = validated.candidates;
      this.loaded = true;
      logger.info(`Loaded ${this.candidates.length} skill candidate(s) from disk`);
    } catch (error) {
      logger.error("Failed to load skill-candidates.json", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.candidates = [];
      this.loaded = true;
    }
  }

  private saveToJsonSync(): void {
    const file: SkillCandidatesFile = {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      candidates: this.candidates,
    };

    try {
      mkdirSync(dirname(SKILL_CANDIDATES_FILE), { recursive: true });
      writeFileSync(
        SKILL_CANDIDATES_FILE,
        JSON.stringify(file, null, 2) + "\n",
        "utf-8"
      );
      logger.info(`Saved ${this.candidates.length} skill candidate(s) to disk`);
    } catch (error) {
      logger.error("Failed to save skill-candidates.json", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (process.env.DATABASE_URL?.trim()) {
      throw new Error(
        "skillCandidatesStore.load() must be awaited before use when DATABASE_URL is set"
      );
    }
    this.loadFromJsonSync();
  }

  private async persistCandidate(candidate: SkillCandidate): Promise<void> {
    const repo = this.dbEnabled ? getSkillCandidatesDbRepository() : null;
    if (repo) {
      await repo.upsertSkill(candidate);
    }
    if (!repo || isDualWriteJsonEnabled()) {
      this.saveToJsonSync();
    }
  }

  async upsertCandidate(data: {
    capability: string;
    description: string;
    audience?: CapabilityAudience;
    scope?: RequestScope;
    brandId?: string | null;
    suggestedSkillFile: string;
    triggerPatterns?: string[];
    confidence?: SkillCandidate["confidence"];
    requiresApproval?: boolean;
    source?: SkillCandidate["source"];
  }): Promise<SkillCandidate> {
    this.ensureLoaded();

    const capability = data.capability.trim();
    const skillFile = normalizeSuggestedSkillFilePath(data.suggestedSkillFile);
    const description = data.description.trim();
    const audience = data.audience ?? "marketer";
    const scope = data.scope ?? "global";
    const brandId = scope === "brand" ? data.brandId?.trim() || null : null;
    const confidence = data.confidence ?? "medium";
    const incomingPatterns = normalizePatterns(data.triggerPatterns ?? []);

    const existing = this.candidates.find(
      (candidate) =>
        candidate.capability.toLowerCase() === capability.toLowerCase() ||
        candidate.suggestedSkillFile.toLowerCase() === skillFile.toLowerCase()
    );

    if (existing) {
      existing.description = description || existing.description;
      existing.audience = audience;
      existing.scope = scope;
      existing.brandId = brandId;
      existing.triggerPatterns = normalizePatterns([
        ...existing.triggerPatterns,
        ...incomingPatterns,
      ]);
      existing.requiresApproval = data.requiresApproval ?? existing.requiresApproval;
      existing.source = data.source ?? existing.source;
      if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[existing.confidence]) {
        existing.confidence = confidence;
      }
      await this.persistCandidate(existing);
      return existing;
    }

    const fuzzyExisting = this.candidates.find((candidate) => {
      const capabilityOverlap = tokenOverlapScore(
        candidate.capability,
        capability
      );
      const descriptionOverlap = tokenOverlapScore(
        candidate.description,
        description
      );
      const fileStemOverlap = tokenOverlapScore(
        extractSkillFileStem(candidate.suggestedSkillFile),
        extractSkillFileStem(skillFile)
      );
      const hasPatternOverlap = hasTriggerPatternSimilarity(
        candidate.triggerPatterns,
        incomingPatterns
      );

      if (hasPatternOverlap) return true;
      if (capabilityOverlap >= 3 && (descriptionOverlap >= 3 || fileStemOverlap >= 2)) {
        return true;
      }
      return false;
    });

    if (fuzzyExisting) {
      fuzzyExisting.description = description || fuzzyExisting.description;
      fuzzyExisting.audience = audience;
      fuzzyExisting.scope = scope;
      fuzzyExisting.brandId = brandId;
      fuzzyExisting.triggerPatterns = normalizePatterns([
        ...fuzzyExisting.triggerPatterns,
        ...incomingPatterns,
      ]);
      fuzzyExisting.requiresApproval =
        data.requiresApproval ?? fuzzyExisting.requiresApproval;
      fuzzyExisting.source = data.source ?? fuzzyExisting.source;
      if (
        CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[fuzzyExisting.confidence]
      ) {
        fuzzyExisting.confidence = confidence;
      }
      await this.persistCandidate(fuzzyExisting);
      return fuzzyExisting;
    }

    const candidate: SkillCandidate = {
      id: nextCandidateId(this.candidates),
      capability,
      description,
      audience,
      scope,
      brandId,
      suggestedSkillFile: skillFile || "skills/learned/new-agent-skill.md",
      triggerPatterns: incomingPatterns,
      confidence,
      requiresApproval: data.requiresApproval ?? false,
      source: data.source ?? "agency",
      addedAt: new Date().toISOString(),
      lastUsedAt: null,
      usageCount: 0,
    };

    this.candidates.push(candidate);
    await this.persistCandidate(candidate);
    return candidate;
  }

  async incrementUsage(candidateId: string): Promise<void> {
    this.ensureLoaded();
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    candidate.usageCount += 1;
    candidate.lastUsedAt = new Date().toISOString();

    const repo = this.dbEnabled ? getSkillCandidatesDbRepository() : null;
    if (repo) {
      await repo.incrementUsage(candidateId);
    }
    if (!repo || isDualWriteJsonEnabled()) {
      this.saveToJsonSync();
    }
  }

  getSummary(requestContext?: RequestContext): Array<{
    id: string;
    capability: string;
    description: string;
    audience: CapabilityAudience;
    scope: RequestScope;
    brandId: string | null;
    suggestedSkillFile: string;
    triggerPatterns: string[];
    confidence: SkillCandidate["confidence"];
    requiresApproval: boolean;
    materialized: boolean;
  }> {
    this.ensureLoaded();
    return [...this.candidates]
      .filter((candidate) => candidateMatchesRequestContext(candidate, requestContext))
      .sort((a, b) => {
        const brandPriority =
          getBrandScopePriority(b, requestContext) - getBrandScopePriority(a, requestContext);
        if (brandPriority !== 0) return brandPriority;
        return b.usageCount - a.usageCount;
      })
      .slice(0, 20)
      .map((candidate) => ({
        id: candidate.id,
        capability: candidate.capability,
        description: candidate.description,
        audience: candidate.audience,
        scope: candidate.scope,
        brandId: candidate.brandId,
        suggestedSkillFile: candidate.suggestedSkillFile,
        triggerPatterns: candidate.triggerPatterns,
        confidence: candidate.confidence,
        requiresApproval: candidate.requiresApproval,
        materialized: skillFileExists(candidate.suggestedSkillFile),
      }));
  }

  findBestMatchByPrompt(
    prompt: string,
    requestContext?: RequestContext
  ): SkillCandidate | null {
    this.ensureLoaded();

    const lowerPrompt = prompt.trim().toLowerCase();
    if (!lowerPrompt) return null;

    const matchingCandidates = this.candidates.filter((item) =>
      candidateMatchesRequestContext(item, requestContext)
    );

    const brandScopedCandidates = matchingCandidates.filter(
      (candidate) => getBrandScopePriority(candidate, requestContext) === 2
    );
    const globalCandidates = matchingCandidates.filter(
      (candidate) => getBrandScopePriority(candidate, requestContext) < 2
    );

    const preferredMatch = findBestCandidateMatch(lowerPrompt, brandScopedCandidates);
    if (preferredMatch) return preferredMatch;

    return findBestCandidateMatch(lowerPrompt, globalCandidates);
  }

  getAll(): SkillCandidate[] {
    this.ensureLoaded();
    return [...this.candidates];
  }

  count(): number {
    this.ensureLoaded();
    return this.candidates.length;
  }

  isMaterialized(skillFile: string): boolean {
    return skillFileExists(skillFile);
  }
}

function findBestCandidateMatch(
  lowerPrompt: string,
  candidates: SkillCandidate[]
): SkillCandidate | null {
  let best: SkillCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
      let score = 0;

      for (const pattern of candidate.triggerPatterns) {
        const normalized = pattern.trim().toLowerCase();
        if (!normalized) continue;
        if (lowerPrompt.includes(normalized)) {
          score += normalized.length;
        }

        const overlap = tokenOverlapScore(lowerPrompt, normalized);
        if (overlap >= 2) {
          score += overlap * 3;
        }
      }

      if (score === 0) {
        const capabilityHint = candidate.capability.trim().toLowerCase();
        if (capabilityHint && lowerPrompt.includes(capabilityHint)) {
          score += Math.max(4, capabilityHint.length / 2);
        }

        const descriptionHint = candidate.description.trim().toLowerCase();
        const capabilityOverlap = tokenOverlapScore(lowerPrompt, capabilityHint);
        if (capabilityOverlap >= 2) {
          score += capabilityOverlap * 2;
        }

        const descriptionOverlap = tokenOverlapScore(lowerPrompt, descriptionHint);
        if (descriptionOverlap >= 3) {
          score += descriptionOverlap;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
        continue;
      }

      if (
        score > 0 &&
        score === bestScore &&
        best &&
        CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[best.confidence]
      ) {
        best = candidate;
      }
    }

  return bestScore > 0 ? best : null;
}

export const skillCandidatesStore = new SkillCandidatesStoreImpl();

function candidateMatchesRequestContext(
  candidate: SkillCandidate,
  requestContext?: RequestContext
): boolean {
  if (!requestContext) return true;
  if (!allowsAudience(candidate.audience, requestContext.audience)) return false;
  if (candidate.scope === "global") return true;
  return candidate.brandId === requestContext.brandId;
}

function getBrandScopePriority(
  candidate: SkillCandidate,
  requestContext?: RequestContext
): number {
  if (!requestContext?.brandId) return candidate.scope === "global" ? 1 : 0;
  if (candidate.scope === "brand" && candidate.brandId === requestContext.brandId) {
    return 2;
  }
  if (candidate.scope === "global") return 1;
  return 0;
}
