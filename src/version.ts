import { existsSync, readFileSync } from "node:fs";

function loadVersion(): string {
  const candidates = [
    new URL("./package.json", import.meta.url),
    new URL("../package.json", import.meta.url),
    new URL("../../package.json", import.meta.url),
  ];

  for (const url of candidates) {
    try {
      if (existsSync(url)) {
        const metadata = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
        if (metadata.version) {
          return metadata.version;
        }
      }
    } catch (_) {}
  }

  return "0.2.1";
}

export const VERSION = loadVersion();
