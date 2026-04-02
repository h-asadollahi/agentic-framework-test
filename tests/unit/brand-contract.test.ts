import { describe, expect, it } from "vitest";
import { buildExecutionContext } from "../../src/core/context.js";
import { createMarketerRequestContext } from "../../src/core/request-context.js";

describe("BrandContract", () => {
  it("builds a deterministic brand contract in execution context", async () => {
    const context = await buildExecutionContext("brand-contract-default");

    expect(context.brandContract.identity.name).toBe(context.brandIdentity.name);
    expect(context.brandContract.guardrails).toEqual(context.guardrails);
    expect(context.brandContract.hash).toHaveLength(40);
    expect(context.brandContract.version).toHaveLength(12);
    expect(context.brandContract.judgementNotes.length).toBeGreaterThan(0);
  });

  it("changes contract hash when the brand changes", async () => {
    const acme = await buildExecutionContext("brand-contract-acme");
    const fashion = await buildExecutionContext(
      "brand-contract-fashion",
      createMarketerRequestContext("northline-fashion", "api")
    );

    expect(acme.brandContract.hash).not.toBe(fashion.brandContract.hash);
    expect(fashion.brandContract.identity.name).toContain("Northline");
  });
});
