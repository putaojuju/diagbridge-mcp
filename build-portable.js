import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const DIAGBRIDGE_VERSION = pkg.version;

const NODE_VERSION = "22.13.0";
const NODE_WIN_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;
const NODE_EXPECTED_SHA256 = "364dbc8442f8d5c04fd4226bcfcf8e60d3268627eb1d7be214a91bb7d74cdbb9";

const CLOUDFLARED_VERSION = "2025.2.1";
const CLOUDFLARED_WIN_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`;
const CLOUDFLARED_EXPECTED_SHA256 = "c5479e3ad7a78ba21b1bc56ed2742df2da74bf28612c34c7a7a8a98edc6682f2";

const ALLOW_LOCAL_RUNTIME = process.env.DIAGBRIDGE_PORTABLE_ALLOW_LOCAL_RUNTIME === "1";

function sha256(filePath) {
  const buffer = readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

function safeCopyFileSync(src, dest) {
  try {
    copyFileSync(src, dest);
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.error(`ERROR: Destination file ${dest} is locked or in use.`);
      process.exit(1);
    }
    throw err;
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

async function verifyOrDownloadBinary(name, url, expectedSha256, cachePath) {
  const partPath = `${cachePath}.part`;

  if (existsSync(cachePath)) {
    const hash = sha256(cachePath);
    if (hash.toLowerCase() === expectedSha256.toLowerCase()) {
      console.log(`[OK] Cached ${name} SHA-256 verified (${hash.slice(0, 12)}...)`);
      return cachePath;
    }
    console.warn(`[WARN] Cached ${name} SHA-256 mismatch (got ${hash}, expected ${expectedSha256}). Re-downloading...`);
    rmSync(cachePath, { force: true });
  }

  console.log(`Downloading ${name} from ${url}...`);
  try {
    await downloadFile(url, partPath);
    const downloadedHash = sha256(partPath);
    if (downloadedHash.toLowerCase() !== expectedSha256.toLowerCase()) {
      rmSync(partPath, { force: true });
      throw new Error(`SHA-256 verification failed for ${name}! Got: ${downloadedHash}, Expected: ${expectedSha256}`);
    }
    renameSync(partPath, cachePath);
    console.log(`[OK] ${name} downloaded and SHA-256 verified (${downloadedHash.slice(0, 12)}...)`);
    return cachePath;
  } catch (err) {
    if (existsSync(partPath)) {
      rmSync(partPath, { force: true });
    }
    if (ALLOW_LOCAL_RUNTIME) {
      console.warn(`[WARN] ${name} download/verification failed (${err.message}). DIAGBRIDGE_PORTABLE_ALLOW_LOCAL_RUNTIME=1 is active, using fallback.`);
      return null;
    }
    console.error(`❌ FATAL BUILD ERROR: ${name} download or SHA-256 verification failed: ${err.message}`);
    process.exit(1);
  }
}

import { cleanOldBuilds } from "./src/utils/clean-builds.ts";


function generateThirdPartyNotices() {
  let lockJson = {};
  try {
    lockJson = JSON.parse(readFileSync("package-lock.json", "utf8"));
  } catch (_) {}

  const packages = lockJson.packages || {};
  const notices = [];

  notices.push(`DiagBridge Portable Third-Party Notices & Licenses`);
  notices.push(`==================================================\n`);
  notices.push(`1. Node.js Executable`);
  notices.push(`   Version: ${NODE_VERSION}`);
  notices.push(`   Source: https://nodejs.org/`);
  notices.push(`   SHA-256: ${NODE_EXPECTED_SHA256}`);
  notices.push(`   License: MIT License (https://github.com/nodejs/node/blob/main/LICENSE)\n`);

  notices.push(`2. Cloudflare Cloudflared Executable`);
  notices.push(`   Version: ${CLOUDFLARED_VERSION}`);
  notices.push(`   Source: https://github.com/cloudflare/cloudflared`);
  notices.push(`   SHA-256: ${CLOUDFLARED_EXPECTED_SHA256}`);
  notices.push(`   License: Apache License 2.0 (https://github.com/cloudflare/cloudflared/blob/master/LICENSE)\n`);

  notices.push(`3. Bundled NPM Dependencies:`);

  for (const [pkgPath, info] of Object.entries(packages)) {
    if (!pkgPath || pkgPath === "") continue;
    const name = pkgPath.replace(/^node_modules\//, "");
    const version = info.version || "unknown";
    const license = info.license || "See package repository";
    notices.push(`   - ${name} (v${version}) [License: ${license}]`);
  }

  return notices.join("\n");
}

function generateTroubleshootingContent() {
  return `DiagBridge Portable 私测版 - 常见故障排查指南 v${DIAGBRIDGE_VERSION}
==================================================

1. 页面没有自动打开
   - 原因：Windows 默认浏览器响应较慢或被拦截。
   - 解决：请手动打开浏览器，在地址栏输入访问：http://127.0.0.1:8790

2. Tunnel 建立超时
   - 原因：本地网络波动或连接 Cloudflare Quick Tunnel 延迟过高。
   - 解决：在页面上点击“⏹ 结束诊断”，稍等 3 秒后再次点击“▶ 开始诊断”重新建立隧道。

3. 公司网络阻止 Cloudflare
   - 原因：企业防火墙屏蔽了 trycloudflare.com 域名。
   - 解决：可以改用“局域网连接地址”（格式为 http://192.168.x.x:8787/mcp）。要求远程工程师与待诊断电脑处于同一局域网或 VPN 内。

4. 防火墙提示如何处理
   - 原因：Windows 防火墙首次对本地 Node 端口绑定发起安全询问。
   - 解决：点击“允许访问”（仅勾选“专用网络”即可）。DiagBridge 本地控制面板仅绑定 127.0.0.1。

5. 如何彻底结束诊断
   - 方法一：在控制面板页面点击“⏹ 结束诊断”按钮；
   - 方法二：直接关闭“启动 DiagBridge.cmd”命令行黑框窗口。
   - 结束诊断后，当前 Token 及公网 HTTPS 隧道立即永久失效。

6. 如何检查是否还有 node.exe / cloudflared.exe 残留
   - 按下 Ctrl + Shift + Esc 打开“任务管理器”；
   - 在“详细信息”页签中查找是否还有名为 node.exe 或 cloudflared.exe 的进程；
   - 如有残留，右键点击“结束任务”即可。
`;
}

function generateReleaseNotesContent() {
  return `DiagBridge Portable 私测版 Release Notes (v${DIAGBRIDGE_VERSION})
==================================================

【本版本更新重点】
1. 绿色免安装单文件打包：无需安装 Node.js、Git 或 npm，解压即用。
2. 自动化 HTTPS 通道导出：内置 Cloudflare Quick Tunnel，一键生成安全的远程诊断凭据。
3. 严格只读诊断工具箱：仅开放 system_info, drive_inventory, junk_candidates, windows_event_summary 4个只读工具。
4. 绝对安全防线：屏蔽任意命令执行、文件读取与文件写入，Token 单次生成、自动到期并实时注销。
`;
}

async function buildPortable() {
  console.log("=== Building DiagBridge Portable Release Package ===");

  cleanOldBuilds();

  mkdirSync("cache", { recursive: true });
  mkdirSync("tools", { recursive: true });

  const cachedNodePath = join("cache", `node-${NODE_VERSION}.exe`);
  const cachedCloudflaredPath = join("cache", `cloudflared-${CLOUDFLARED_VERSION}.exe`);

  const nodeVerified = await verifyOrDownloadBinary("Node.exe", NODE_WIN_URL, NODE_EXPECTED_SHA256, cachedNodePath);
  const cloudflaredVerified = await verifyOrDownloadBinary("cloudflared.exe", CLOUDFLARED_WIN_URL, CLOUDFLARED_EXPECTED_SHA256, cachedCloudflaredPath);

  const releaseDir = join("release", "DiagBridge-Portable");
  mkdirSync(join(releaseDir, "runtime"), { recursive: true });
  mkdirSync(join(releaseDir, "app"), { recursive: true });
  mkdirSync(join(releaseDir, "tools"), { recursive: true });

  // Copy app
  cpSync("dist/app", join(releaseDir, "app"), { recursive: true });

  // Copy node.exe
  if (nodeVerified && existsSync(nodeVerified)) {
    safeCopyFileSync(nodeVerified, join(releaseDir, "runtime", "node.exe"));
  } else {
    safeCopyFileSync(process.execPath, join(releaseDir, "runtime", "node.exe"));
  }

  // Copy cloudflared.exe
  if (cloudflaredVerified && existsSync(cloudflaredVerified)) {
    safeCopyFileSync(cloudflaredVerified, join(releaseDir, "tools", "cloudflared.exe"));
    safeCopyFileSync(cloudflaredVerified, join("tools", "cloudflared.exe"));
  } else {
    console.error("❌ FATAL: cloudflared.exe is missing. Portable package cannot be generated.");
    process.exit(1);
  }

  // Create launcher batch script
  const launcherContent = `@echo off
cd /d "%~dp0"
title DiagBridge 远程诊断桥 v${DIAGBRIDGE_VERSION}
echo ==================================================
echo 🛡️ 正在启动 DiagBridge 本地控制面板...
echo ==================================================
runtime\\node.exe app\\diagbridge.mjs
pause
`;
  writeFileSync(join(releaseDir, "启动 DiagBridge.cmd"), launcherContent, "utf8");

  // Create THIRD_PARTY_NOTICES.txt
  writeFileSync(join(releaseDir, "THIRD_PARTY_NOTICES.txt"), generateThirdPartyNotices(), "utf8");

  // Create 故障排查.txt inside releaseDir
  const troubleContent = generateTroubleshootingContent();
  writeFileSync(join(releaseDir, "故障排查.txt"), troubleContent, "utf8");

  // Create 使用说明.txt
  const readmeContent = `DiagBridge 绿色免安装诊断工具包 v${DIAGBRIDGE_VERSION} - 使用说明
==================================================

【适用环境】
Windows 10 / 11 64位系统 (无需安装 Node.js、Git 或 npm)。

【组件版本】
- DiagBridge MCP: v${DIAGBRIDGE_VERSION}
- Node.js Runtime: v${NODE_VERSION}
- Cloudflare Tunnel: v${CLOUDFLARED_VERSION}

【使用步骤】
1. 解压全套 Zip 文件到任意文件夹；
2. 双击运行 “启动 DiagBridge.cmd”；
3. 浏览器会自动打开 http://127.0.0.1:8790 本地控制面板；
4. 点击页面上的“▶ 开始诊断”按钮；
5. 系统将自动建立加密 HTTPS 远程通道并生成一次性密钥；
6. 点击“📋 复制连接信息”发送给远程工程师即可；
7. 诊断完成后，点击“⏹ 结束诊断”或直接关闭窗口，远程通道及进程立即完全作废销毁。

【安全防护说明】
- 远程仅开放 system_info, drive_inventory, junk_candidates, windows_event_summary 4个只读工具。
- 文件写入、读取及任意命令执行均已被彻底屏蔽。
- 详见同目录下的《故障排查.txt》。
`;
  writeFileSync(join(releaseDir, "使用说明.txt"), readmeContent, "utf8");

  // Create build-manifest.json
  const manifest = {
    diagbridgeVersion: DIAGBRIDGE_VERSION,
    nodeVersion: NODE_VERSION,
    nodeSha256: NODE_EXPECTED_SHA256,
    cloudflaredVersion: CLOUDFLARED_VERSION,
    cloudflaredSha256: CLOUDFLARED_EXPECTED_SHA256,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(join(releaseDir, "build-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Compress into ZIP archive using package version
  const zipPath = join("release", `DiagBridge-Portable-v${DIAGBRIDGE_VERSION}.zip`);
  console.log(`Compressing ${releaseDir} into ${zipPath}...`);
  try {
    const { execSync } = await import("node:child_process");
    execSync(`powershell -Command "Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${zipPath}' -Force"`);
    console.log(`📦 Zip archive generated: ${zipPath}`);
  } catch (err) {
    console.warn(`Zip archive creation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Generate SHA-256 for the ZIP archive
  if (existsSync(zipPath)) {
    const zipHash = sha256(zipPath);
    const sha256FilePath = `${zipPath}.sha256`;
    writeFileSync(sha256FilePath, `${zipHash}  DiagBridge-Portable-v${DIAGBRIDGE_VERSION}.zip\n`, "utf8");
    console.log(`🔑 SHA-256 checksum generated: ${sha256FilePath} (${zipHash})`);
  }

  // Generate Release Notes & Standalone Troubleshooting doc in release/
  writeFileSync(join("release", `release-notes-v${DIAGBRIDGE_VERSION}.txt`), generateReleaseNotesContent(), "utf8");
  writeFileSync(join("release", `故障排查-v${DIAGBRIDGE_VERSION}.txt`), troubleContent, "utf8");

  console.log(`✅ Portable private beta package generated successfully at: ${releaseDir}`);
}

if (process.argv[1] && process.argv[1].endsWith("build-portable.js")) {
  buildPortable().catch((err) => {
    console.error("Failed to build portable package:", err);
    process.exit(1);
  });
}
