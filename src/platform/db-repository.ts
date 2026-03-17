import { LearnedRoutesDbRepository } from "../routing/learned-routes-db-repository.js";

let cachedRepository: LearnedRoutesDbRepository | null = null;

export function getPlatformDbRepository(): LearnedRoutesDbRepository | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  if (!cachedRepository) {
    cachedRepository = new LearnedRoutesDbRepository(databaseUrl);
  }

  return cachedRepository;
}
