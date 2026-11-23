import fs from "node:fs";
import path from "node:path";

let cachedWorkspaceRoot: string | null = null;

function findWorkspaceRootFrom(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, "pnpm-workspace.yaml");
    if (fs.existsSync(marker)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Resolves the monorepo root by walking up from cwd (or __dirname) until pnpm-workspace.yaml is found.
 */
export function resolveWorkspaceRoot(): string {
  if (cachedWorkspaceRoot) {
    return cachedWorkspaceRoot;
  }
  const fromCwd = findWorkspaceRootFrom(process.cwd());
  if (fromCwd) {
    cachedWorkspaceRoot = fromCwd;
    return fromCwd;
  }
  if (typeof __dirname !== "undefined") {
    const fromDirname = findWorkspaceRootFrom(__dirname);
    if (fromDirname) {
      cachedWorkspaceRoot = fromDirname;
      return fromDirname;
    }
  }
  return process.cwd();
}

/**
 * Ensures a directory path exists on disk.
 */
export function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Resolves a path inside <workspaceRoot>/data and ensures its directory exists if requested.
 */
export function resolveDataPath(...segments: string[]): string {
  const root = resolveWorkspaceRoot();
  const dataRoot = path.resolve(root, "data");
  const resolved = path.resolve(dataRoot, ...segments);
  const relative = path.relative(dataRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes data directory: ${resolved}`);
  }
  return resolved;
}

/**
 * Resolves a workspace-relative or absolute SQLite database path.
 */
export function resolveDbPath(customDbPath?: string): string {
  const target = customDbPath ?? process.env.DATABASE_URL ?? "./data/app.db";
  if (target === ":memory:") {
    return ":memory:";
  }
  const resolved = path.isAbsolute(target)
    ? target
    : path.resolve(resolveWorkspaceRoot(), target);
  ensureDir(path.dirname(resolved));
  return resolved;
}

/**
 * Ensures all standard data subdirectories exist.
 */
export function ensureDataDirectories(): {
  dataDir: string;
  profilesDir: string;
  mediaDir: string;
  logsDir: string;
  dryRunLogsDir: string;
  challengeLogsDir: string;
} {
  const dataDir = ensureDir(resolveDataPath());
  const profilesDir = ensureDir(resolveDataPath("profiles"));
  const mediaDir = ensureDir(resolveDataPath("media"));
  const logsDir = ensureDir(resolveDataPath("logs"));
  const dryRunLogsDir = ensureDir(resolveDataPath("logs", "dry-run"));
  const challengeLogsDir = ensureDir(resolveDataPath("logs", "challenges"));
  return {
    dataDir,
    profilesDir,
    mediaDir,
    logsDir,
    dryRunLogsDir,
    challengeLogsDir,
  };
}
