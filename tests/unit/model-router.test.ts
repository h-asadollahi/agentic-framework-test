import { describe, it, expect } from "vitest";
import { modelRouter } from "../../src/providers/model-router.js";

describe("ModelRouter", () => {
  it("resolves known aliases", () => {
    // Should not throw for known aliases
    const model = modelRouter.resolve("anthropic:fast");
    expect(model).toBeDefined();
  });

  it("throws for unknown aliases", () => {
    expect(() => modelRouter.resolve("unknown:nonexistent")).toThrow();
  });

  it("returns model list for known agents", () => {
    const models = modelRouter.getModelsForAgent("grounding");
    expect(models.length).toBeGreaterThan(0);
    expect(typeof models[0]).toBe("string");
  });

  it("returns defaults for unknown agents", () => {
    const models = modelRouter.getModelsForAgent("nonexistent-agent");
    expect(models.length).toBeGreaterThan(0);
  });

  it("selects by complexity level", () => {
    const fast = modelRouter.selectByComplexity("low");
    const balanced = modelRouter.selectByComplexity("medium");
    const powerful = modelRouter.selectByComplexity("high");

    expect(fast).toBeDefined();
    expect(balanced).toBeDefined();
    expect(powerful).toBeDefined();
  });
});
