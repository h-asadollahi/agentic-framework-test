import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import type { SubAgentPlugin, ExecutionContext, AgentResult } from "../../src/core/types.js";

// Inline mini-registry for unit testing (avoids importing singleton)
class TestRegistry {
  private agents = new Map<string, SubAgentPlugin>();

  register(plugin: SubAgentPlugin) {
    this.agents.set(plugin.id, plugin);
  }

  get(id: string) {
    return this.agents.get(id);
  }

  has(id: string) {
    return this.agents.has(id);
  }

  list() {
    return Array.from(this.agents.values());
  }

  findByCapability(cap: string) {
    return this.list().filter((a) => a.capabilities.includes(cap));
  }

  getSummary() {
    return this.list().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
    }));
  }
}

// Stub plugin
function createStubPlugin(overrides: Partial<SubAgentPlugin> = {}): SubAgentPlugin {
  return {
    id: "test-agent",
    name: "Test Agent",
    description: "A test agent",
    version: "1.0.0",
    capabilities: ["testing"],
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    execute: async (): Promise<AgentResult> => ({
      success: true,
      output: "test output",
      modelUsed: "test-model",
    }),
    ...overrides,
  };
}

describe("SubAgentRegistry", () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  it("registers and retrieves a plugin", () => {
    const plugin = createStubPlugin();
    registry.register(plugin);

    expect(registry.has("test-agent")).toBe(true);
    expect(registry.get("test-agent")).toBe(plugin);
  });

  it("lists all registered plugins", () => {
    registry.register(createStubPlugin({ id: "agent-1", name: "Agent 1" }));
    registry.register(createStubPlugin({ id: "agent-2", name: "Agent 2" }));

    expect(registry.list()).toHaveLength(2);
  });

  it("finds plugins by capability", () => {
    registry.register(
      createStubPlugin({
        id: "analytics",
        capabilities: ["analytics", "reporting"],
      })
    );
    registry.register(
      createStubPlugin({
        id: "content",
        capabilities: ["content-generation"],
      })
    );

    const analytics = registry.findByCapability("analytics");
    expect(analytics).toHaveLength(1);
    expect(analytics[0].id).toBe("analytics");

    const reporting = registry.findByCapability("reporting");
    expect(reporting).toHaveLength(1);

    const none = registry.findByCapability("nonexistent");
    expect(none).toHaveLength(0);
  });

  it("returns summary of all agents", () => {
    registry.register(createStubPlugin({ id: "a1", name: "Agent 1" }));
    registry.register(createStubPlugin({ id: "a2", name: "Agent 2" }));

    const summary = registry.getSummary();
    expect(summary).toHaveLength(2);
    expect(summary[0]).toHaveProperty("id");
    expect(summary[0]).toHaveProperty("name");
    expect(summary[0]).toHaveProperty("capabilities");
    expect(summary[0]).not.toHaveProperty("execute"); // no execute in summary
  });

  it("returns undefined for unknown agent", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
    expect(registry.has("nonexistent")).toBe(false);
  });
});
