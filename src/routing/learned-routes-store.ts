import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  LearnedRoutesFileSchema,
  type LearnedRoute,
  type LearnedRoutesFile,
  type Endpoint,
} from "./learned-routes-schema.js";
import { logger } from "../core/logger.js";

// ── File path resolution ────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    const hasPackageJson = existsSync(join(current, "package.json"));
    const hasKnowledgeDir = existsSync(join(current, "knowledge"));

    if (hasPackageJson && hasKnowledgeDir) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

const PROJECT_ROOT =
  findProjectRoot(process.cwd()) ??
  findProjectRoot(__dirname) ??
  resolve(__dirname, "../..");

const ROUTES_FILE = resolve(PROJECT_ROOT, "knowledge/learned-routes.json");

// ── Store Implementation ────────────────────────────────────

class LearnedRoutesStoreImpl {
  private routes: LearnedRoute[] = [];
  private loaded = false;

  /**
   * Load routes from disk. Safe to call multiple times (re-reads file).
   */
  load(): void {
    if (!existsSync(ROUTES_FILE)) {
      logger.info("No learned-routes.json found, starting with empty routes");
      this.routes = [];
      this.loaded = true;
      return;
    }

    try {
      const raw = readFileSync(ROUTES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const validated = LearnedRoutesFileSchema.parse(parsed);
      this.routes = validated.routes;
      this.loaded = true;
      logger.info(`Loaded ${this.routes.length} learned route(s) from disk`);
    } catch (error) {
      logger.error("Failed to load learned-routes.json", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.routes = [];
      this.loaded = true;
    }
  }

  /**
   * Persist current routes to disk.
   */
  private save(): void {
    const file: LearnedRoutesFile = {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      routes: this.routes,
    };

    try {
      mkdirSync(dirname(ROUTES_FILE), { recursive: true });
      writeFileSync(ROUTES_FILE, JSON.stringify(file, null, 2) + "\n", "utf-8");
      logger.info(`Saved ${this.routes.length} learned route(s) to disk`);
    } catch (error) {
      logger.error("Failed to save learned-routes.json", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Ensure routes are loaded before any operation.
   */
  private ensureLoaded(): void {
    if (!this.loaded) {
      this.load();
    }
  }

  /**
   * Find a route whose matchPatterns overlap with the given description.
   * Uses a simple keyword-match scoring (longer pattern matches = higher score).
   */
  findByCapability(description: string): LearnedRoute | null {
    this.ensureLoaded();

    const lower = description.toLowerCase();
    let bestMatch: LearnedRoute | null = null;
    let bestScore = 0;

    for (const route of this.routes) {
      let score = 0;
      for (const pattern of route.matchPatterns) {
        if (lower.includes(pattern.toLowerCase())) {
          score += pattern.length; // longer matches → higher confidence
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = route;
      }
    }

    if (bestMatch) {
      logger.info(`Matched learned route "${bestMatch.id}" (score: ${bestScore})`, {
        capability: bestMatch.capability,
        description: description.slice(0, 80),
      });
    }

    return bestMatch;
  }

  /**
   * Get a route by its ID.
   */
  getById(routeId: string): LearnedRoute | null {
    this.ensureLoaded();
    return this.routes.find((r) => r.id === routeId) ?? null;
  }

  /**
   * Add a new learned route and persist to disk.
   */
  addRoute(data: {
    capability: string;
    description: string;
    matchPatterns: string[];
    routeType?: "api" | "sub-agent";
    endpoint?: Endpoint;
    agentId?: string;
    agentInputDefaults?: Record<string, unknown>;
    inputMapping?: Record<string, string>;
    outputFormat?: "json" | "text" | "csv";
    addedBy: string;
  }): LearnedRoute {
    this.ensureLoaded();

    const id = `route-${String(this.routes.length + 1).padStart(3, "0")}`;

    const newRoute: LearnedRoute = {
      id,
      capability: data.capability,
      description: data.description,
      matchPatterns: data.matchPatterns,
      routeType: data.routeType ?? "api",
      endpoint: data.endpoint,
      agentId: data.agentId,
      agentInputDefaults: data.agentInputDefaults ?? {},
      inputMapping: data.inputMapping ?? {},
      outputFormat: data.outputFormat ?? "json",
      addedAt: new Date().toISOString(),
      addedBy: data.addedBy,
      usageCount: 0,
      lastUsedAt: null,
    };

    this.routes.push(newRoute);
    this.save();

    logger.info(`New learned route added: "${id}" (${data.capability})`, {
      matchPatterns: data.matchPatterns.slice(0, 5),
      routeType: newRoute.routeType,
      target:
        newRoute.routeType === "api"
          ? newRoute.endpoint?.url
          : newRoute.agentId,
    });

    return newRoute;
  }

  /**
   * Increment usage counter for a route and persist.
   */
  incrementUsage(routeId: string): void {
    this.ensureLoaded();

    const route = this.routes.find((r) => r.id === routeId);
    if (route) {
      route.usageCount += 1;
      route.lastUsedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Get all routes.
   */
  getAll(): LearnedRoute[] {
    this.ensureLoaded();
    return [...this.routes];
  }

  /**
   * Compact summary for injection into the cognition agent's system prompt.
   * Returns the top 20 routes sorted by usage (most used first).
   */
  getSummary(): Array<{
    id: string;
    capability: string;
    description: string;
    matchPatterns: string[];
    routeType: "api" | "sub-agent";
    agentId?: string;
    endpointUrl?: string;
  }> {
    this.ensureLoaded();

    return this.routes
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        capability: r.capability,
        description: r.description,
        matchPatterns: r.matchPatterns,
        routeType: r.routeType,
        agentId: r.agentId,
        endpointUrl: r.endpoint?.url,
      }));
  }

  /**
   * Number of learned routes.
   */
  count(): number {
    this.ensureLoaded();
    return this.routes.length;
  }
}

/**
 * Singleton store instance.
 */
export const learnedRoutesStore = new LearnedRoutesStoreImpl();
