import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../core/logger.js";
import {
  SkillCandidatesFileSchema,
  type SkillCandidate,
  type SkillCandidatesFile,
} from "./skill-candidates-schema.js";

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

function nextCandidateId(candidates: SkillCandidate[]): string {
  return `skill-${String(candidates.length + 1).padStart(3, "0")}`;
}

class SkillCandidatesStoreImpl {
  private candidates: SkillCandidate[] = [];
  private loaded = false;

  load(): void {
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

  private save(): void {
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
    if (!this.loaded) {
      this.load();
    }
  }

  upsertCandidate(data: {
    capability: string;
    description: string;
    suggestedSkillFile: string;
    triggerPatterns?: string[];
    confidence?: SkillCandidate["confidence"];
    requiresApproval?: boolean;
    source?: SkillCandidate["source"];
  }): SkillCandidate {
    this.ensureLoaded();

    const capability = data.capability.trim();
    const skillFile = data.suggestedSkillFile.trim();
    const description = data.description.trim();
    const confidence = data.confidence ?? "medium";

    const existing = this.candidates.find(
      (candidate) =>
        candidate.capability.toLowerCase() === capability.toLowerCase() ||
        candidate.suggestedSkillFile.toLowerCase() === skillFile.toLowerCase()
    );

    if (existing) {
      existing.description = description || existing.description;
      existing.triggerPatterns = normalizePatterns([
        ...existing.triggerPatterns,
        ...(data.triggerPatterns ?? []),
      ]);
      existing.requiresApproval = data.requiresApproval ?? existing.requiresApproval;
      existing.source = data.source ?? existing.source;
      if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[existing.confidence]) {
        existing.confidence = confidence;
      }
      this.save();
      return existing;
    }

    const candidate: SkillCandidate = {
      id: nextCandidateId(this.candidates),
      capability,
      description,
      suggestedSkillFile: skillFile || "skills/new-agent-skill.md",
      triggerPatterns: normalizePatterns(data.triggerPatterns ?? []),
      confidence,
      requiresApproval: data.requiresApproval ?? false,
      source: data.source ?? "agency",
      addedAt: new Date().toISOString(),
      lastUsedAt: null,
      usageCount: 0,
    };

    this.candidates.push(candidate);
    this.save();
    return candidate;
  }

  incrementUsage(candidateId: string): void {
    this.ensureLoaded();
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    candidate.usageCount += 1;
    candidate.lastUsedAt = new Date().toISOString();
    this.save();
  }

  getSummary(): Array<{
    id: string;
    capability: string;
    description: string;
    suggestedSkillFile: string;
    triggerPatterns: string[];
    confidence: SkillCandidate["confidence"];
    requiresApproval: boolean;
    materialized: boolean;
  }> {
    this.ensureLoaded();
    return [...this.candidates]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 20)
      .map((candidate) => ({
        id: candidate.id,
        capability: candidate.capability,
        description: candidate.description,
        suggestedSkillFile: candidate.suggestedSkillFile,
        triggerPatterns: candidate.triggerPatterns,
        confidence: candidate.confidence,
        requiresApproval: candidate.requiresApproval,
        materialized: skillFileExists(candidate.suggestedSkillFile),
      }));
  }

  findBestMatchByPrompt(prompt: string): SkillCandidate | null {
    this.ensureLoaded();

    const lowerPrompt = prompt.trim().toLowerCase();
    if (!lowerPrompt) return null;

    let best: SkillCandidate | null = null;
    let bestScore = 0;

    for (const candidate of this.candidates) {
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

export const skillCandidatesStore = new SkillCandidatesStoreImpl();
