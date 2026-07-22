import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { join } from "node:path";

const NODE_WIN_URL = "https://nodejs.org/dist/v22.13.0/win-x64/node.exe";
const CLOUDFLARED_WIN_URL = "https://github.com/cloudflare/cloudflared/releases/download/2025.2.1/cloudflared-windows-amd64.exe";

function sha256(filePath) {
  const buffer = readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

function safeCopyFileSync(src, dest) {
  try {
    copyFileSync(src, dest);
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.warn(`File ${dest} is currently locked or in use, skipping overwrite.`);
    } else {
      throw err;
    }
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        writeFileSync(destPath, Buffer.concat(chunks));
        resolve();
      });
      response.on("error", reject);
    }).on("error", reject);
  });
}

async function prepareBinaries() {
  mkdirSync("tools", { recursive: true });
  mkdirSync("cache", { recursive: true });

  const cachedNodePath = join("cache", "node.exe");
  const cachedCloudflaredPath = join("cache", "cloudflared.exe");

  // 1. Ensure node.exe
  if (!existsSync(cachedNodePath)) {
    console.log(`Downloading bundled Node.exe from ${NODE_WIN_URL}...`);
    try {
      await downloadFile(NODE_WIN_URL, cachedNodePath);
      console.log(`Downloaded Node.exe SHA256: ${sha256(cachedNodePath)}`);
    } catch (err) {
      console.warn(`Download node.exe failed (${err instanceof Error ? err.message : String(err)}), copying process.execPath as fallback.`);
      safeCopyFileSync(process.execPath, cachedNodePath);
    }
  }

  // 2. Ensure cloudflared.exe
  if (!existsSync(cachedCloudflaredPath)) {
    console.log(`Downloading cloudflared.exe from ${CLOUDFLARED_WIN_URL}...`);
    try {
      await downloadFile(CLOUDFLARED_WIN_URL, cachedCloudflaredPath);
      console.log(`Downloaded cloudflared.exe SHA256: ${sha256(cachedCloudflaredPath)}`);
    } catch (err) {
      console.warn(`Download cloudflared.exe failed (${err instanceof Error ? err.message : String(err)}).`);
    }
  }

  // Copy cloudflared to tools/
  if (existsSync(cachedCloudflaredPath)) {
    safeCopyFileSync(cachedCloudflaredPath, join("tools", "cloudflared.exe"));
  }
}

async function buildPortable() {
  console.log("=== Building DiagBridge Portable Release Package ===");

  await prepareBinaries();

  const releaseDir = join("release", "DiagBridge-Portable");
  mkdirSync(join(releaseDir, "runtime"), { recursive: true });
  mkdirSync(join(releaseDir, "app"), { recursive: true });
  mkdirSync(join(releaseDir, "tools"), { recursive: true });

  // 1. Copy app
  cpSync("dist/app", join(releaseDir, "app"), { recursive: true });

  // 2. Copy runtime node.exe
  const cachedNodePath = join("cache", "node.exe");
  if (existsSync(cachedNodePath)) {
    safeCopyFileSync(cachedNodePath, join(releaseDir, "runtime", "node.exe"));
  } else {
    safeCopyFileSync(process.execPath, join(releaseDir, "runtime", "node.exe"));
  }

  // 3. Copy tools cloudflared.exe
  const cachedCloudflaredPath = join("cache", "cloudflared.exe");
  if (existsSync(cachedCloudflaredPath)) {
    safeCopyFileSync(cachedCloudflaredPath, join(releaseDir, "tools", "cloudflared.exe"));
  }

  // 4. Create 启动 DiagBridge.cmd using ONLY relative paths
  const launcherContent = `@echo off
cd /d "%~dp0"
title DiagBridge 远程诊断桥
echo ==================================================
echo 🛡️ 正在启动 DiagBridge 本地控制面板...
echo ==================================================
runtime\\node.exe app\\diagbridge.mjs
pause
`;
  writeFileSync(join(releaseDir, "启动 DiagBridge.cmd"), launcherContent, "utf8");

  // 5. Create THIRD_PARTY_NOTICES.txt
  const noticesContent = `DiagBridge Portable Third-Party Notices & Licenses
==================================================

1. Node.js (https://nodejs.org/)
   Version: 22.13.0 / Portable Executable
   License: MIT License

2. Cloudflare Cloudflared (https://github.com/cloudflare/cloudflared)
   Version: 2025.2.1
   License: Apache License 2.0

3. Model Context Protocol SDK (@modelcontextprotocol/sdk)
   License: MIT License
`;
  writeFileSync(join(releaseDir, "THIRD_PARTY_NOTICES.txt"), noticesContent, "utf8");

  // 6. Create 使用说明.txt
  const readmeContent = `DiagBridge 绿色免安装诊断工具包 - 使用说明
==================================================

【适用环境】
Windows 10 / 11 64位系统 (无需安装 Node.js、Git 或 npm)。

【使用步骤】
1. 解压全套 Zip 文件到任意文件夹；
2. 双击运行 “启动 DiagBridge.cmd”；
3. 浏览器会自动打开 http://127.0.0.1:8790 本地控制面板；
4. 点击页面上的“▶ 开始诊断”按钮；
5. 系统将自动建立加密 HTTPS 远程通道并生成一次性密钥；
6. 点击“📋 复制连接信息”发送给远程工程师即可；
7. 诊断完成后，点击“⏹ 结束诊断”或直接关闭窗口，远程通道立即失效。

【安全防护说明】
- 远程仅开放 system_info, drive_inventory, junk_candidates, windows_event_summary 4个只读工具。
- 文件写入、读取及任意命令执行均已被彻底屏蔽。
`;
  writeFileSync(join(releaseDir, "使用说明.txt"), readmeContent, "utf8");

  // 7. Compress into ZIP archive
  const zipPath = join("release", "DiagBridge-Portable-v0.2.1.zip");
  console.log(`Compressing ${releaseDir} into ${zipPath}...`);
  try {
    const { execSync } = await import("node:child_process");
    execSync(`powershell -Command "Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${zipPath}' -Force"`);
    console.log(`📦 Zip archive generated: ${zipPath}`);
  } catch (err) {
    console.warn(`Zip archive creation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`✅ Portable package generated successfully at: ${releaseDir}`);
}

buildPortable().catch((err) => {
  console.error("Failed to build portable package:", err);
  process.exit(1);
});
