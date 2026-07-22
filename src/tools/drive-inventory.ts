import { extname, isAbsolute, normalize, resolve, sep } from "node:path";
import { readdir, stat } from "node:fs/promises";
import * as z from "zod/v4";
import type { ToolDefinition } from "../mcp/types.ts";

export interface DriveInventoryEntry {
  path: string;
  name: string;
  type: "file" | "directory" | "other";
  sizeBytes?: number;
  mtime?: string;
  extension?: string;
}

export interface DriveInventoryResult {
  root: string;
  scannedEntries: number;
  truncated: boolean;
  entries: DriveInventoryEntry[];
}

export const DEFAULT_EXCLUDE_PATHS = [
  "%USERPROFILE%\\.ssh",
  "%APPDATA%\\Mozilla\\Firefox",
  "%LOCALAPPDATA%\\Google\\Chrome\\User Data",
  "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data",
  "%APPDATA%\\Microsoft\\Windows\\Recent",
  "C:\\Windows\\System32",
  "C:\\Windows\\WinSxS",
  "C:\\Windows\\Installer",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
];

function numberArg(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = args[key];
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function boolArg(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof args[key] === "boolean" ? args[key] : fallback;
}

export function expandWindowsEnv(input: string, env: Record<string, string | undefined> = process.env): string {
  return input.replace(/%([^%]+)%/g, (_match, name: string) => env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()] ?? `%${name}%`);
}

export function resolveScanRoot(inputPath: string, cwd = process.cwd()): string {
  if (!inputPath || inputPath.trim().length === 0) {
    throw new Error("root is required");
  }

  if (inputPath.includes("\0")) {
    throw new Error("root must not contain null bytes");
  }

  const expanded = expandWindowsEnv(inputPath.trim());
  return normalize(isAbsolute(expanded) ? expanded : resolve(cwd, expanded));
}

function normalizeForCompare(inputPath: string): string {
  return normalize(expandWindowsEnv(inputPath)).replace(/[\\/]+/g, sep).replace(/[\\/]+$/g, "").toLowerCase();
}

function isWithinPath(pathName: string, root: string): boolean {
  const pathNorm = normalizeForCompare(pathName);
  const rootNorm = normalizeForCompare(root);
  return pathNorm === rootNorm || pathNorm.startsWith(`${rootNorm}${sep}`);
}

function isExcluded(pathName: string, excludePaths: string[]): boolean {
  return excludePaths.some((excludedPath) => isWithinPath(pathName, excludedPath));
}

function looksHidden(name: string): boolean {
  return name.startsWith(".") || name === "$RECYCLE.BIN" || name === "System Volume Information";
}

function entryType(statsMode: { isFile(): boolean; isDirectory(): boolean }): "file" | "directory" | "other" {
  if (statsMode.isFile()) {
    return "file";
  }
  if (statsMode.isDirectory()) {
    return "directory";
  }
  return "other";
}

export async function driveInventory(args: Record<string, unknown>, cwd = process.cwd()): Promise<DriveInventoryResult> {
  const root = resolveScanRoot(String(args.root ?? ""), cwd);
  const maxDepth = numberArg(args, "maxDepth", 2, 0, 10);
  const maxEntries = numberArg(args, "maxEntries", 5000, 1, 100_000);
  const maxSeconds = numberArg(args, "maxSeconds", 30, 1, 300);
  const includeHidden = boolArg(args, "includeHidden", false);
  const userExcludes = Array.isArray(args.excludePaths) ? args.excludePaths.map(String) : [];
  const excludePaths = [...DEFAULT_EXCLUDE_PATHS, ...userExcludes].map((item) => resolveScanRoot(item, cwd));
  const deadline = Date.now() + maxSeconds * 1000;
  const entries: DriveInventoryEntry[] = [];
  let truncated = false;

  async function walk(directoryPath: string, depth: number): Promise<void> {
    if (truncated || entries.length >= maxEntries || Date.now() > deadline) {
      truncated = true;
      return;
    }

    if (isExcluded(directoryPath, excludePaths)) {
      return;
    }

    let children;
    try {
      children = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const child of children) {
      if (entries.length >= maxEntries || Date.now() > deadline) {
        truncated = true;
        return;
      }

      if (!includeHidden && looksHidden(child.name)) {
        continue;
      }

      const childPath = normalize(resolve(directoryPath, child.name));
      if (isExcluded(childPath, excludePaths)) {
        continue;
      }

      let childStat;
      try {
        childStat = await stat(childPath);
      } catch {
        continue;
      }

      const type = entryType(childStat);
      entries.push({
        path: childPath,
        name: child.name,
        type,
        sizeBytes: type === "file" ? childStat.size : undefined,
        mtime: childStat.mtime.toISOString(),
        extension: type === "file" ? extname(child.name).toLowerCase() : undefined,
      });

      if (type === "directory" && depth < maxDepth) {
        await walk(childPath, depth + 1);
      }
    }
  }

  await walk(root, 0);

  return {
    root,
    scannedEntries: entries.length,
    truncated,
    entries,
  };
}

export const driveInventoryDefinition: ToolDefinition = {
  name: "drive_inventory",
  title: "Drive inventory",
  description: "Read-only directory metadata scan. It records names, types, sizes, modified times, and extensions without reading file contents.",
  zodSchema: {
    root: z.string(),
    maxDepth: z.number().int().min(0).max(10).optional(),
    maxEntries: z.number().int().min(1).max(100_000).optional(),
    maxSeconds: z.number().int().min(1).max(300).optional(),
    includeHidden: z.boolean().optional(),
    excludePaths: z.array(z.string()).optional(),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (args, config) => driveInventory(args, config.cwd),
};
