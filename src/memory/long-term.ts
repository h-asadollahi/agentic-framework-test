import type { LongTermMemory } from "../core/types.js";
import { logger } from "../core/logger.js";

/**
 * Long-Term Memory Store
 *
 * Persists synthesized learnings, past decisions, and brand context cache
 * across sessions. In-memory implementation for now — production should
 * use a database or vector store.
 *
 * Long-term memory is shared across all sessions — it represents
 * the agent's accumulated knowledge about the brand.
 */

const MAX_LEARNINGS = 100;
const MAX_DECISIONS = 200;

class LongTermMemoryStore {
  private memory: LongTermMemory = {
    synthesizedLearnings: [],
    pastDecisions: [],
    brandContextCache: {},
  };

  /**
   * Get the full long-term memory.
   */
  get(): LongTermMemory {
    return { ...this.memory };
  }

  /**
   * Add a synthesized learning.
   */
  addLearning(learning: string): void {
    // Avoid duplicates
    if (this.memory.synthesizedLearnings.includes(learning)) return;

    this.memory.synthesizedLearnings.push(learning);

    if (this.memory.synthesizedLearnings.length > MAX_LEARNINGS) {
      this.memory.synthesizedLearnings =
        this.memory.synthesizedLearnings.slice(-MAX_LEARNINGS);
    }

    logger.info("Learning added to long-term memory", {
      total: this.memory.synthesizedLearnings.length,
    });
  }

  /**
   * Record a past decision and its outcome.
   */
  addDecision(task: string, decision: string, outcome: string): void {
    this.memory.pastDecisions.push({ task, decision, outcome });

    if (this.memory.pastDecisions.length > MAX_DECISIONS) {
      this.memory.pastDecisions =
        this.memory.pastDecisions.slice(-MAX_DECISIONS);
    }
  }

  /**
   * Cache a brand context value.
   */
  cacheContext(key: string, value: unknown): void {
    this.memory.brandContextCache[key] = value;
  }

  /**
   * Retrieve a cached brand context value.
   */
  getCachedContext(key: string): unknown {
    return this.memory.brandContextCache[key];
  }

  /**
   * Search learnings for relevant context.
   */
  searchLearnings(query: string): string[] {
    const lower = query.toLowerCase();
    return this.memory.synthesizedLearnings.filter((l) =>
      l.toLowerCase().includes(lower)
    );
  }

  /**
   * Search past decisions for relevant context.
   */
  searchDecisions(
    query: string
  ): Array<{ task: string; decision: string; outcome: string }> {
    const lower = query.toLowerCase();
    return this.memory.pastDecisions.filter(
      (d) =>
        d.task.toLowerCase().includes(lower) ||
        d.decision.toLowerCase().includes(lower)
    );
  }

  /**
   * Get summary stats.
   */
  stats(): { learnings: number; decisions: number; cacheKeys: number } {
    return {
      learnings: this.memory.synthesizedLearnings.length,
      decisions: this.memory.pastDecisions.length,
      cacheKeys: Object.keys(this.memory.brandContextCache).length,
    };
  }

  /**
   * Reset all long-term memory.
   */
  reset(): void {
    this.memory = {
      synthesizedLearnings: [],
      pastDecisions: [],
      brandContextCache: {},
    };
    logger.info("Long-term memory reset");
  }
}

export const longTermMemory = new LongTermMemoryStore();
