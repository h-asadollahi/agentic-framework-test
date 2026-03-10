import { afterEach, describe, expect, it } from "vitest";
import {
  exportLearnedRoutesFromDbToJson,
  importLearnedRoutesFromJsonToDb,
} from "../../src/routing/learned-routes-migration.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("learned-routes migration utilities", () => {
  it("fails import when DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL;
    await expect(importLearnedRoutesFromJsonToDb()).rejects.toThrow(
      "DATABASE_URL is required"
    );
  });

  it("fails export when DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL;
    await expect(exportLearnedRoutesFromDbToJson()).rejects.toThrow(
      "DATABASE_URL is required"
    );
  });
});

