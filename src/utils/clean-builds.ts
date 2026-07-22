import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export function cleanOldBuilds(cwd = process.cwd()): void {
  console.log("Cleaning old release build directories...");
  rmSync(join(cwd, "release", "DiagBridge-Portable"), { recursive: true, force: true });

  const releaseDir = join(cwd, "release");
  if (existsSync(releaseDir)) {
    const files = readdirSync(releaseDir);
    for (const file of files) {
      if (
        file.endsWith(".zip") ||
        file.endsWith(".sha256") ||
        file.startsWith("release-notes-") ||
        file.startsWith("故障排查-")
      ) {
        rmSync(join(releaseDir, file), { force: true });
      }
    }
  }
}
