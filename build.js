import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function bundle() {
  console.log("Building dist/app/diagbridge.mjs via esbuild...");

  mkdirSync("dist/app/public", { recursive: true });

  await build({
    entryPoints: ["src/ui/launch-friend-ui.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: "dist/app/diagbridge.mjs",
    external: [
      "node:*",
      "crypto",
      "fs",
      "path",
      "url",
      "http",
      "child_process",
      "os",
      "stream",
      "events",
      "util",
      "net",
      "tls",
      "assert",
    ],
    sourcemap: false,
    minify: false,
  });

  // Copy static public assets
  cpSync("src/ui/public", "dist/app/public", { recursive: true });

  // Copy package.json to dist/app/
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  writeFileSync("dist/app/package.json", JSON.stringify(packageJson, null, 2), "utf8");

  console.log("Build completed: dist/app/diagbridge.mjs");
}

bundle().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
