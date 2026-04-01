import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LearnedRoutesFileSchema, type LearnedRoute } from "./learned-routes-schema.js";
import { LearnedRoutesDbRepository } from "./learned-routes-db-repository.js";

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

const DEFAULT_JSON_PATH = resolve(PROJECT_ROOT, "knowledge/learned-routes.json");

function getRepository(): LearnedRoutesDbRepository {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for learned-routes DB migration");
  }
  return new LearnedRoutesDbRepository(databaseUrl);
}

export async function importLearnedRoutesFromJsonToDb(options: {
  jsonFile?: string;
} = {}): Promise<{ imported: number; skipped: number; totalInFile: number }> {
  const repo = getRepository();
  const jsonFile = options.jsonFile
    ? resolve(PROJECT_ROOT, options.jsonFile)
    : DEFAULT_JSON_PATH;

  if (!existsSync(jsonFile)) {
    throw new Error(`JSON source file not found: ${jsonFile}`);
  }

  const parsed = LearnedRoutesFileSchema.parse(
    JSON.parse(readFileSync(jsonFile, "utf-8"))
  );

  await repo.init();

  const existing = await repo.listRoutes({ limit: 5000, offset: 0 });
  const existingIds = new Set(existing.map((route) => route.id));

  let imported = 0;
  let skipped = 0;

  for (const route of parsed.routes) {
    if (existingIds.has(route.id)) {
      skipped += 1;
      continue;
    }

    await repo.upsertRoute(route);
    await repo.recordEvent({
      routeId: route.id,
      eventType: "route_backfilled_from_json",
      details: { source: jsonFile },
    });
    imported += 1;
  }

  await repo.close();

  return {
    imported,
    skipped,
    totalInFile: parsed.routes.length,
  };
}

export async function exportLearnedRoutesFromDbToJson(options: {
  jsonFile?: string;
} = {}): Promise<{ exported: number; targetFile: string }> {
  const jsonFile = options.jsonFile
    ? resolve(PROJECT_ROOT, options.jsonFile)
    : DEFAULT_JSON_PATH;

  const repo = getRepository();
  await repo.init();

  const routes = await repo.listRoutes({ limit: 5000, offset: 0 });
  const payload = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    routes: routes as LearnedRoute[],
  };

  mkdirSync(dirname(jsonFile), { recursive: true });
  writeFileSync(jsonFile, JSON.stringify(payload, null, 2) + "\n", "utf-8");

  await repo.recordEvent({
    eventType: "route_exported_to_json",
    details: { target: jsonFile, count: routes.length },
  });
  await repo.close();

  return { exported: routes.length, targetFile: jsonFile };
}
