import { spawn } from "node:child_process";
import * as z from "zod/v4";
import type { ToolDefinition } from "../mcp/types.ts";

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export async function runCommand(input: Record<string, unknown>): Promise<CommandResult> {
  const command = input.command;
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new Error("command must be a non-empty string");
  }

  const args = Array.isArray(input.args) ? input.args.map(String) : [];
  const timeoutMs = typeof input.timeoutMs === "number" ? input.timeoutMs : 30_000;
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      resolvePromise({ command, args, exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

export const runCommandDefinition: ToolDefinition = {
  name: "run_command",
  title: "Run command",
  description: "Run a local command. This is destructive and open-world. Enable only for trusted sessions and rely on the MCP host approval policy.",
  zodSchema: {
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().min(100).max(300_000).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  handler: async (args, config) => {
    if (!config.runCommandEnabled) {
      throw new Error("run_command is disabled by current DiagBridge config");
    }
    return runCommand(args);
  },
};
