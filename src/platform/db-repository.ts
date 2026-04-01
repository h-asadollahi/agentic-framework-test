import { LearnedRoutesDbRepository } from "../routing/learned-routes-db-repository.js";
import { SkillCandidatesDbRepository } from "../routing/skill-candidates-db-repository.js";

let cachedRepository: LearnedRoutesDbRepository | null = null;
let cachedSkillCandidatesRepository: SkillCandidatesDbRepository | null = null;

export function getPlatformDbRepository(): LearnedRoutesDbRepository | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  if (!cachedRepository) {
    cachedRepository = new LearnedRoutesDbRepository(databaseUrl);
  }

  return cachedRepository;
}

export function getSkillCandidatesDbRepository(): SkillCandidatesDbRepository | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  if (!cachedSkillCandidatesRepository) {
    cachedSkillCandidatesRepository = new SkillCandidatesDbRepository(databaseUrl);
  }

  return cachedSkillCandidatesRepository;
}
