import type { Message, ShortTermMemory } from "../core/types.js";
import { logger } from "../core/logger.js";

/**
 * Short-Term Memory Store
 *
 * Manages per-session conversation history and active context.
 * Data lives in memory and is lost on process restart.
 *
 * In production, this should be backed by Redis or a similar store
 * for persistence across restarts and horizontal scaling.
 */

const MAX_HISTORY_LENGTH = 50;

class ShortTermMemoryStore {
  private sessions: Map<string, ShortTermMemory> = new Map();

  /**
   * Get or create a session's short-term memory.
   */
  get(sessionId: string): ShortTermMemory {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        conversationHistory: [],
        activeContext: {},
      });
    }
    return this.sessions.get(sessionId)!;
  }

  /**
   * Add a message to a session's conversation history.
   */
  addMessage(sessionId: string, message: Omit<Message, "timestamp">): void {
    const memory = this.get(sessionId);

    memory.conversationHistory.push({
      ...message,
      timestamp: new Date(),
    });

    // Trim to max length (keep most recent)
    if (memory.conversationHistory.length > MAX_HISTORY_LENGTH) {
      memory.conversationHistory = memory.conversationHistory.slice(
        -MAX_HISTORY_LENGTH
      );
    }
  }

  /**
   * Set a value in the session's active context.
   */
  setContext(sessionId: string, key: string, value: unknown): void {
    const memory = this.get(sessionId);
    memory.activeContext[key] = value;
  }

  /**
   * Get a value from the session's active context.
   */
  getContext(sessionId: string, key: string): unknown {
    return this.get(sessionId).activeContext[key];
  }

  /**
   * Get recent conversation history for prompt context.
   */
  getRecentHistory(sessionId: string, count: number = 10): Message[] {
    const memory = this.get(sessionId);
    return memory.conversationHistory.slice(-count);
  }

  /**
   * Clear a session's memory.
   */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info(`Short-term memory cleared for session: ${sessionId}`);
  }

  /**
   * Check if a session exists.
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get count of active sessions.
   */
  sessionCount(): number {
    return this.sessions.size;
  }
}

export const shortTermMemory = new ShortTermMemoryStore();
