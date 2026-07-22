import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type TunnelStatus = "stopped" | "starting" | "ready" | "failed";

export interface TunnelResult {
  url?: string;
  mcpEndpoint?: string;
  error?: string;
}

export interface CloudflareTunnelOptions {
  binaryPath?: string;
  mockChildProcess?: ChildProcess;
  onUnexpectedExit?: (reason: string) => void;
}

export function parseTunnelUrl(text: string): string | null {
  if (!text || (text.includes("error") && !text.includes("trycloudflare.com"))) {
    return null;
  }
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  return match ? match[0] : null;
}

export function resolveCloudflaredPath(overridePath?: string): string {
  if (overridePath && existsSync(overridePath)) {
    return overridePath;
  }

  const cwd = process.cwd();
  const candidates = [
    join(cwd, "tools", "cloudflared.exe"),
    join(cwd, "release", "DiagBridge-Portable", "tools", "cloudflared.exe"),
    join(cwd, "..", "tools", "cloudflared.exe"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "cloudflared";
}

export class CloudflareTunnel {
  private childProcess: ChildProcess | null = null;
  private status: TunnelStatus = "stopped";
  private currentUrl: string | null = null;
  private currentMcpEndpoint: string | null = null;
  private binaryPathOverride?: string;
  private onUnexpectedExit?: (reason: string) => void;

  constructor(options?: CloudflareTunnelOptions) {
    if (options?.binaryPath) {
      this.binaryPathOverride = options.binaryPath;
    }
    if (options?.mockChildProcess) {
      this.childProcess = options.mockChildProcess;
    }
    if (options?.onUnexpectedExit) {
      this.onUnexpectedExit = options.onUnexpectedExit;
    }
  }

  setUnexpectedExitHandler(handler: (reason: string) => void): void {
    this.onUnexpectedExit = handler;
  }

  getStatus(): TunnelStatus {
    return this.status;
  }

  getUrl(): string | null {
    return this.currentUrl;
  }

  getMcpEndpoint(): string | null {
    return this.currentMcpEndpoint;
  }

  async start(localTargetUrl = "http://127.0.0.1:8787", timeoutMs = 30000): Promise<TunnelResult> {
    if (this.status === "starting" || this.status === "ready") {
      if (this.currentMcpEndpoint) {
        return { url: this.currentUrl!, mcpEndpoint: this.currentMcpEndpoint };
      }
    }

    await this.stop();

    this.status = "starting";
    const binaryPath = resolveCloudflaredPath(this.binaryPathOverride);

    return new Promise((resolve) => {
      let resolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.stop();
          this.status = "failed";
          resolve({ error: "Cloudflare Quick Tunnel 建立超时（30秒），请检查网络或重试。" });
        }
      }, timeoutMs);

      const finishWithSuccess = (url: string) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutTimer);
          this.currentUrl = url;
          this.currentMcpEndpoint = `${url}/mcp`;
          this.status = "ready";
          resolve({ url: this.currentUrl, mcpEndpoint: this.currentMcpEndpoint });
        }
      };

      const finishWithError = (errMsg: string) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutTimer);
          this.status = "failed";
          this.stop();
          resolve({ error: errMsg });
        }
      };

      try {
        const args = ["tunnel", "--no-autoupdate", "--url", localTargetUrl];
        const child = this.childProcess || spawn(binaryPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        this.childProcess = child;

        const handleOutput = (data: Buffer | string) => {
          const text = typeof data === "string" ? data : data.toString("utf8");
          const parsedUrl = parseTunnelUrl(text);
          if (parsedUrl) {
            finishWithSuccess(parsedUrl);
          }
        };

        child.stdout?.on("data", handleOutput);
        child.stderr?.on("data", handleOutput);

        child.on("error", (err) => {
          finishWithError(`无法启动 cloudflared 进程: ${err.message}`);
        });

        child.on("exit", (code) => {
          const wasReady = this.status === "ready";
          this.status = "stopped";
          this.currentUrl = null;
          this.currentMcpEndpoint = null;

          if (!resolved) {
            finishWithError(`cloudflared 进程意外退出，退出码: ${code ?? "null"}`);
          } else if (wasReady && this.onUnexpectedExit) {
            this.onUnexpectedExit(`cloudflared 进程崩溃或被终止，退出码: ${code ?? "null"}`);
          }
        });
      } catch (err) {
        finishWithError(`启动 Quick Tunnel 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.currentUrl = null;
    this.currentMcpEndpoint = null;

    if (this.childProcess) {
      const proc = this.childProcess;
      this.childProcess = null;

      try {
        proc.kill("SIGKILL");
      } catch (_) {}

      if (proc.pid && process.platform === "win32") {
        try {
          execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "ignore" });
        } catch (_) {}
      }
    }
  }
}
