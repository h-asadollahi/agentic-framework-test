import path from "path";
import { promises as fs } from "fs";

// Resolve once at module load — never trust process.cwd() at call time
const KNOWLEDGE_ROOT = path.resolve(process.cwd(), "knowledge");

// 512 KB — enough for any reasonable .md file
const MAX_FILE_BYTES = 512 * 1024;

/**
 * Resolves a user-supplied relative path to an absolute path that is
 * strictly inside KNOWLEDGE_ROOT.
 *
 * Throws on:
 *  - absolute paths
 *  - path traversal (../ etc.)
 *  - non-.md extensions
 */
function resolveSafePath(relativePath: string): string {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("path must be a non-empty string");
  }

  // Reject absolute paths before we even call resolve()
  if (path.isAbsolute(relativePath)) {
    throw new Error("Absolute paths are not allowed");
  }

  // path.normalize collapses ../ sequences
  const normalized = path.normalize(relativePath);

  // After normalisation an escape still starts with "../"
  if (normalized.startsWith("..")) {
    throw new Error("Path traversal is not allowed");
  }

  const resolved = path.resolve(KNOWLEDGE_ROOT, normalized);

  // Must be a strict descendant (the trailing sep prevents matching
  // a sibling dir named e.g. "knowledge-extra")
  if (!resolved.startsWith(KNOWLEDGE_ROOT + path.sep)) {
    throw new Error("Path traversal is not allowed");
  }

  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Only .md files are allowed");
  }

  return resolved;
}

export interface KnowledgeFile {
  /** Forward-slash relative path from knowledge root, e.g. "brands/acme/soul.md" */
  path: string;
  /** Basename without extension */
  name: string;
  sizeBytes: number;
}

async function walk(dir: string): Promise<KnowledgeFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: KnowledgeFile[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walk(full)));
    } else if (
      entry.isFile() &&
      path.extname(entry.name).toLowerCase() === ".md"
    ) {
      const stat = await fs.stat(full);
      const rel = path.relative(KNOWLEDGE_ROOT, full).replace(/\\/g, "/");
      results.push({ path: rel, name: path.basename(entry.name, ".md"), sizeBytes: stat.size });
    }
  }

  return results;
}

/** Returns all .md files in the knowledge folder (recursive). */
export async function listKnowledgeFiles(): Promise<KnowledgeFile[]> {
  return walk(KNOWLEDGE_ROOT);
}

// ── Brand-scoped helpers ──────────────────────────────────────────────────────
// These restrict access to knowledge/brands/{brandId}/ only.
// Used by the public marketer API — no admin auth is involved.

const BRAND_ID_RE = /^[a-zA-Z0-9_-]+$/;

function assertValidBrandId(brandId: string): void {
  if (typeof brandId !== "string" || !brandId.trim()) {
    throw new Error("brandId must be a non-empty string");
  }
  if (!BRAND_ID_RE.test(brandId)) {
    throw new Error("brandId contains invalid characters");
  }
}

function getBrandRoot(brandId: string): string {
  assertValidBrandId(brandId);
  return path.resolve(KNOWLEDGE_ROOT, "brands", brandId);
}

function resolveSafeBrandPath(brandId: string, relativePath: string): string {
  const brandRoot = getBrandRoot(brandId);

  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("path must be a non-empty string");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error("Absolute paths are not allowed");
  }

  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..")) {
    throw new Error("Path traversal is not allowed");
  }

  const resolved = path.resolve(brandRoot, normalized);
  if (!resolved.startsWith(brandRoot + path.sep)) {
    throw new Error("Path traversal is not allowed");
  }

  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Only .md files are allowed");
  }

  return resolved;
}

async function walkBrand(dir: string, brandRoot: string): Promise<KnowledgeFile[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const results: KnowledgeFile[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkBrand(full, brandRoot)));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
      const stat = await fs.stat(full);
      const rel = path.relative(brandRoot, full).replace(/\\/g, "/");
      results.push({ path: rel, name: path.basename(entry.name, ".md"), sizeBytes: stat.size });
    }
  }
  return results;
}

/** Returns all .md files under knowledge/brands/{brandId}/ */
export async function listBrandFiles(brandId: string): Promise<KnowledgeFile[]> {
  const brandRoot = getBrandRoot(brandId);
  return walkBrand(brandRoot, brandRoot);
}

/** Reads a .md file from knowledge/brands/{brandId}/{relativePath} */
export async function readBrandFile(brandId: string, relativePath: string): Promise<string> {
  const resolved = resolveSafeBrandPath(brandId, relativePath);

  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error("Not a regular file");
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File size (${stat.size} bytes) exceeds the ${MAX_FILE_BYTES}-byte limit`);
  }

  return fs.readFile(resolved, "utf-8");
}

/** Overwrites an existing .md file in knowledge/brands/{brandId}/{relativePath} */
export async function writeBrandFile(
  brandId: string,
  relativePath: string,
  content: string
): Promise<void> {
  const resolved = resolveSafeBrandPath(brandId, relativePath);

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error("Target path is not a regular file");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("File not found — only existing files can be edited");
    }
    throw err;
  }

  if (typeof content !== "string") throw new Error("content must be a string");

  const byteLen = Buffer.byteLength(content, "utf-8");
  if (byteLen > MAX_FILE_BYTES) {
    throw new Error(`Content (${byteLen} bytes) exceeds the ${MAX_FILE_BYTES}-byte limit`);
  }

  await fs.writeFile(resolved, content, "utf-8");
}

/** Reads and returns the content of a knowledge .md file. */
export async function readKnowledgeFile(relativePath: string): Promise<string> {
  const resolved = resolveSafePath(relativePath);

  const stat = await fs.stat(resolved);
  if (!stat.isFile()) {
    throw new Error("Not a regular file");
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File size (${stat.size} bytes) exceeds the ${MAX_FILE_BYTES}-byte limit`);
  }

  return fs.readFile(resolved, "utf-8");
}

/**
 * Overwrites an existing knowledge .md file.
 * Creating new files via this function is intentionally not supported.
 */
export async function writeKnowledgeFile(
  relativePath: string,
  content: string
): Promise<void> {
  const resolved = resolveSafePath(relativePath);

  // Confirm the file already exists — no silent creation
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      throw new Error("Target path is not a regular file");
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("File not found — only existing files can be edited");
    }
    throw err;
  }

  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }

  const byteLen = Buffer.byteLength(content, "utf-8");
  if (byteLen > MAX_FILE_BYTES) {
    throw new Error(`Content (${byteLen} bytes) exceeds the ${MAX_FILE_BYTES}-byte limit`);
  }

  await fs.writeFile(resolved, content, "utf-8");
}
