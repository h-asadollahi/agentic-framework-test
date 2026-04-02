import { createHash } from "node:crypto";
import type {
  AgencyResult,
  AgentResult,
  CognitionResult,
  DeliveryResult,
} from "../core/types.js";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const planCache = new Map<string, CacheEntry<CognitionResult>>();
const deterministicResultCache = new Map<string, CacheEntry<AgentResult>>();
const renderCache = new Map<string, CacheEntry<DeliveryResult>>();

const DEFAULT_PLAN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RESULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RENDER_TTL_MS = 5 * 60 * 1000;

function hashKey(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function readCache<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const cached = store.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function buildPlanCacheKey(input: {
  userMessage: string;
  brandContractHash: string;
  routeInventoryHash: string;
  skillInventoryHash: string;
  audience: string;
  scope: string;
}): string {
  return hashKey(input);
}

export function getCachedPlan(key: string): CognitionResult | null {
  return readCache(planCache, key);
}

export function setCachedPlan(
  key: string,
  value: CognitionResult,
  ttlMs = DEFAULT_PLAN_TTL_MS
): void {
  writeCache(planCache, key, value, ttlMs);
}

export function buildDeterministicResultCacheKey(input: {
  agentId: string;
  routeId?: string | null;
  normalizedInput: unknown;
  brandContractHash: string;
}): string {
  return hashKey(input);
}

export function getCachedDeterministicResult(key: string): AgentResult | null {
  return readCache(deterministicResultCache, key);
}

export function setCachedDeterministicResult(
  key: string,
  value: AgentResult,
  ttlMs = DEFAULT_RESULT_TTL_MS
): void {
  writeCache(deterministicResultCache, key, value, ttlMs);
}

export function buildRenderCacheKey(input: {
  brandContractHash: string;
  agencySummary: string;
  issues: string[];
  results: AgencyResult["results"];
}): string {
  return hashKey(input);
}

export function getCachedRender(key: string): DeliveryResult | null {
  return readCache(renderCache, key);
}

export function setCachedRender(
  key: string,
  value: DeliveryResult,
  ttlMs = DEFAULT_RENDER_TTL_MS
): void {
  writeCache(renderCache, key, value, ttlMs);
}

export function clearOptimizationCaches(): void {
  planCache.clear();
  deterministicResultCache.clear();
  renderCache.clear();
}
