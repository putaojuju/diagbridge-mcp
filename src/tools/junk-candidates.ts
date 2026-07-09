import { extname, basename } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { ToolMetadata } from "../config.ts";
import { driveInventory, expandWindowsEnv, resolveScanRoot, DEFAULT_EXCLUDE_PATHS } from "./drive-inventory.ts";

export type JunkReason = "old_temp_files" | "installer_download" | "crash_dump" | "old_log" | "empty_directory";
export type CandidateConfidence = "low" | "medium" | "high";

export interface JunkCandidate {
  path: string;
  estimatedBytes: number;
  fileCount: number;
  reason: JunkReason;
  confidence: CandidateConfidence;
  recommendedAction: "review_only";
}

export interface JunkCandidatesResult {
  candidates: JunkCandidate[];
  totalEstimatedBytes: number;
  note: string;
}

export const junkCandidatesTool: ToolMetadata = {
  name: "junk_candidates",
  title: "Junk candidates",
  description: "Read-only scan for possible junk candidates. It does not delete, move, or clean files; every result is review_only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      roots: { type: "array", items: { type: "string" }, default: ["%TEMP%", "%LOCALAPPDATA%\\Temp", "C:\\Windows\\Temp", "%USERPROFILE%\\Downloads"] },
      olderThanDays: { type: "number", default: 14 },
      maxEntries: { type: "number", default: 5000 },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

const DEFAULT_ROOTS = ["%TEMP%", "%LOCALAPPDATA%\\Temp", "C:\\Windows\\Temp", "%USERPROFILE%\\Downloads"];
const DANGEROUS_CLEANUP_ROOTS = [
  ...DEFAULT_EXCLUDE_PATHS,
  "C:\\Windows\\Installer",
  "C:\\Windows\\WinSxS",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "%APPDATA%\\Microsoft\\Teams",
  "%APPDATA%\\Discord",
  "%APPDATA%\\Tencent",
  "%APPDATA%\\Roaming\\.minecraft",
  "%APPDATA%\\Local\\Packages",
  "%USERPROFILE%\\Saved Games",
  "%USERPROFILE%\\Documents\\My Games",
];

function normalizeForCompare(inputPath: string): string {
  return resolveScanRoot(inputPath).replace(/[\\/]+$/g, "").toLowerCase();
}

function isDangerousRoot(root: string): boolean {
  const normalizedRoot = normalizeForCompare(root);
  return DANGEROUS_CLEANUP_ROOTS.some((dangerousRoot) => {
    const normalizedDanger = normalizeForCompare(dangerousRoot);
    return normalizedRoot === normalizedDanger || normalizedRoot.startsWith(`${normalizedDanger}\\`) || normalizedRoot.startsWith(`${normalizedDanger}/`);
  });
}

function numberArg(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = args[key];
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function classifyFile(pathName: string, ageMs: number): Omit<JunkCandidate, "path" | "estimatedBytes" | "fileCount" | "recommendedAction"> | undefined {
  const extension = extname(pathName).toLowerCase();
  const lowerName = basename(pathName).toLowerCase();
  const daysOld = ageMs / (24 * 60 * 60 * 1000);

  if ([".dmp", ".mdmp", ".wer"].includes(extension)) {
    return { reason: "crash_dump", confidence: daysOld > 7 ? "high" : "medium" };
  }

  if ([".log", ".old", ".bak"].includes(extension) && daysOld > 14) {
    return { reason: "old_log", confidence: "medium" };
  }

  if ([".tmp", ".temp", ".chk"].includes(extension) && daysOld > 3) {
    return { reason: "old_temp_files", confidence: "high" };
  }

  if ([".msi", ".msix", ".exe"].includes(extension) && /(setup|install|installer|update)/i.test(lowerName) && daysOld > 14) {
    return { reason: "installer_download", confidence: "medium" };
  }

  return undefined;
}

export async function junkCandidates(args: Record<string, unknown>, cwd = process.cwd()): Promise<JunkCandidatesResult> {
  const roots = Array.isArray(args.roots) && args.roots.length > 0 ? args.roots.map(String) : DEFAULT_ROOTS;
  const olderThanDays = numberArg(args, "olderThanDays", 14, 1, 3650);
  const maxEntries = numberArg(args, "maxEntries", 5000, 1, 100_000);
  const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const candidates: JunkCandidate[] = [];
  let scannedEntries = 0;

  for (const rootInput of roots) {
    const expandedRoot = expandWindowsEnv(rootInput);
    let root: string;
    try {
      root = resolveScanRoot(expandedRoot, cwd);
    } catch {
      continue;
    }

    if (isDangerousRoot(root)) {
      continue;
    }

    const inventory = await driveInventory({
      root,
      maxDepth: 2,
      maxEntries: Math.max(1, maxEntries - scannedEntries),
      maxSeconds: 20,
      includeHidden: false,
      excludePaths: DANGEROUS_CLEANUP_ROOTS,
    }, cwd);

    scannedEntries += inventory.scannedEntries;

    for (const entry of inventory.entries) {
      if (candidates.length >= maxEntries || scannedEntries >= maxEntries) {
        break;
      }

      if (entry.type === "file" && entry.mtime && entry.sizeBytes !== undefined) {
        const mtime = Date.parse(entry.mtime);
        if (mtime > cutoffMs) {
          continue;
        }

        const classification = classifyFile(entry.path, Date.now() - mtime);
        if (classification) {
          candidates.push({
            path: entry.path,
            estimatedBytes: entry.sizeBytes,
            fileCount: 1,
            reason: classification.reason,
            confidence: classification.confidence,
            recommendedAction: "review_only",
          });
        }
      }

      if (entry.type === "directory" && entry.mtime && Date.parse(entry.mtime) <= cutoffMs) {
        try {
          const children = await readdir(entry.path);
          const dirStat = await stat(entry.path);
          if (children.length === 0) {
            candidates.push({
              path: entry.path,
              estimatedBytes: 0,
              fileCount: 0,
              reason: "empty_directory",
              confidence: Date.now() - dirStat.mtime.getTime() > 30 * 24 * 60 * 60 * 1000 ? "medium" : "low",
              recommendedAction: "review_only",
            });
          }
        } catch {
          // Ignore inaccessible directories in this read-only candidate pass.
        }
      }
    }

    if (scannedEntries >= maxEntries) {
      break;
    }
  }

  return {
    candidates,
    totalEstimatedBytes: candidates.reduce((sum, candidate) => sum + candidate.estimatedBytes, 0),
    note: "Candidates are review_only. DiagBridge did not delete, move, or clean anything.",
  };
}
