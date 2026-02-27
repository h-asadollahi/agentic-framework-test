import { describe, it, expect, beforeEach } from "vitest";
import { shortTermMemory } from "../../src/memory/short-term.js";
import { longTermMemory } from "../../src/memory/long-term.js";

describe("ShortTermMemory", () => {
  const sessionId = "test-session-" + Date.now();

  beforeEach(() => {
    shortTermMemory.clear(sessionId);
  });

  it("creates session on first access", () => {
    const memory = shortTermMemory.get(sessionId);
    expect(memory.sessionId).toBe(sessionId);
    expect(memory.conversationHistory).toEqual([]);
  });

  it("adds messages to conversation history", () => {
    shortTermMemory.addMessage(sessionId, {
      role: "user",
      content: "Hello",
    });
    shortTermMemory.addMessage(sessionId, {
      role: "assistant",
      content: "Hi there!",
    });

    const history = shortTermMemory.getRecentHistory(sessionId);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("Hello");
    expect(history[1].role).toBe("assistant");
    expect(history[0].timestamp).toBeInstanceOf(Date);
  });

  it("returns limited recent history", () => {
    for (let i = 0; i < 10; i++) {
      shortTermMemory.addMessage(sessionId, {
        role: "user",
        content: `Message ${i}`,
      });
    }

    const recent = shortTermMemory.getRecentHistory(sessionId, 3);
    expect(recent).toHaveLength(3);
    expect(recent[0].content).toBe("Message 7");
  });

  it("sets and gets context values", () => {
    shortTermMemory.setContext(sessionId, "topic", "marketing");
    expect(shortTermMemory.getContext(sessionId, "topic")).toBe("marketing");
    expect(shortTermMemory.getContext(sessionId, "unknown")).toBeUndefined();
  });

  it("clears session", () => {
    shortTermMemory.addMessage(sessionId, {
      role: "user",
      content: "test",
    });
    expect(shortTermMemory.has(sessionId)).toBe(true);

    shortTermMemory.clear(sessionId);
    expect(shortTermMemory.has(sessionId)).toBe(false);
  });
});

describe("LongTermMemory", () => {
  beforeEach(() => {
    longTermMemory.reset();
  });

  it("adds and retrieves learnings", () => {
    longTermMemory.addLearning("Users prefer short emails");
    longTermMemory.addLearning("Best engagement on Tuesdays");

    const memory = longTermMemory.get();
    expect(memory.synthesizedLearnings).toHaveLength(2);
  });

  it("deduplicates learnings", () => {
    longTermMemory.addLearning("Same learning");
    longTermMemory.addLearning("Same learning");

    expect(longTermMemory.get().synthesizedLearnings).toHaveLength(1);
  });

  it("records decisions", () => {
    longTermMemory.addDecision(
      "Email campaign",
      "Send on Tuesday",
      "25% higher open rate"
    );

    const memory = longTermMemory.get();
    expect(memory.pastDecisions).toHaveLength(1);
    expect(memory.pastDecisions[0].task).toBe("Email campaign");
  });

  it("caches and retrieves context", () => {
    longTermMemory.cacheContext("topSegment", "high-value-customers");
    expect(longTermMemory.getCachedContext("topSegment")).toBe(
      "high-value-customers"
    );
  });

  it("searches learnings", () => {
    longTermMemory.addLearning("Users prefer short emails");
    longTermMemory.addLearning("Instagram engagement is high");
    longTermMemory.addLearning("Email open rates peak on Tuesday");

    const results = longTermMemory.searchLearnings("email");
    expect(results).toHaveLength(2);
  });

  it("searches decisions", () => {
    longTermMemory.addDecision("Campaign A", "Use video", "Good engagement");
    longTermMemory.addDecision("Campaign B", "Use static", "Low engagement");

    const results = longTermMemory.searchDecisions("video");
    expect(results).toHaveLength(1);
    expect(results[0].task).toBe("Campaign A");
  });

  it("reports stats", () => {
    longTermMemory.addLearning("Learning 1");
    longTermMemory.addDecision("Task", "Decision", "Outcome");
    longTermMemory.cacheContext("key", "value");

    const stats = longTermMemory.stats();
    expect(stats.learnings).toBe(1);
    expect(stats.decisions).toBe(1);
    expect(stats.cacheKeys).toBe(1);
  });
});
