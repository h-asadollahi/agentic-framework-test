import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SkillCandidatesFileSchema, type SkillCandidate } from "./skill-candidates-schema.js";
import { SkillCandidatesDbRepository } from "./skill-candidates-db-repository.js";

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
  findProjectRoot(import.meta.dirname) ??
  resolve(import.meta.dirname, "../..");

const DEFAULT_JSON_PATH = resolve(PROJECT_ROOT, "knowledge/skill-candidates.json");

function getRepository(): SkillCandidatesDbRepository {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for skill-candidates DB migration");
  }
  return new SkillCandidatesDbRepository(databaseUrl);
}

export async function importSkillCandidatesFromJsonToDb(
  options: { jsonFile?: string } = {}
): Promise<{ imported: number; skipped: number; totalInFile: number }> {
  const repo = getRepository();
  const jsonFile = options.jsonFile
    ? resolve(PROJECT_ROOT, options.jsonFile)
    : DEFAULT_JSON_PATH;

  if (!existsSync(jsonFile)) {
    throw new Error(`JSON source file not found: ${jsonFile}`);
  }

  const parsed = SkillCandidatesFileSchema.parse(
    JSON.parse(readFileSync(jsonFile, "utf-8"))
  );

  await repo.init();

  const existing = await repo.getAll();
  const existingIds = new Set(existing.map((c) => c.id));

  let imported = 0;
  let skipped = 0;

  for (const candidate of parsed.candidates) {
    if (existingIds.has(candidate.id)) {
      skipped += 1;
      continue;
    }

    await repo.upsertSkill(candidate);
    imported += 1;
  }

  await repo.close();

  return {
    imported,
    skipped,
    totalInFile: parsed.candidates.length,
  };
}

export async function exportSkillCandidatesFromDbToJson(
  options: { jsonFile?: string } = {}
): Promise<{ exported: number; targetFile: string }> {
  const jsonFile = options.jsonFile
    ? resolve(PROJECT_ROOT, options.jsonFile)
    : DEFAULT_JSON_PATH;

  const repo = getRepository();
  await repo.init();

  const candidates = await repo.getAll();
  const payload = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    candidates: candidates as SkillCandidate[],
  };

  mkdirSync(dirname(jsonFile), { recursive: true });
  writeFileSync(jsonFile, JSON.stringify(payload, null, 2) + "\n", "utf-8");

  await repo.close();

  return { exported: candidates.length, targetFile: jsonFile };
}
