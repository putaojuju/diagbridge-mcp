import { spawn } from "node:child_process";
import type { ToolMetadata } from "../config.ts";

export interface WindowsEventSummaryEntry {
  timeCreated: string;
  logName: string;
  providerName: string;
  eventId: number;
  level: string;
  messageSnippet: string;
}

export interface WindowsEventSummaryResult {
  sinceDays: number;
  events: WindowsEventSummaryEntry[];
  summary: {
    applicationCrashes: number;
    unexpectedShutdowns: number;
    hardwareErrors: number;
    diskErrors: number;
  };
  warning?: string;
}

export const windowsEventSummaryTool: ToolMetadata = {
  name: "windows_event_summary",
  title: "Windows event summary",
  description: "Read recent Windows Application/System error events using a fixed read-only query. It does not accept arbitrary commands and does not auto-elevate.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sinceDays: { type: "number", default: 14 },
      logs: { type: "array", items: { type: "string" }, default: ["Application", "System"] },
      maxEvents: { type: "number", default: 200 },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

const ALLOWED_LOGS = new Set(["Application", "System"]);
const WATCH_PROVIDERS = [
  "Application Error",
  "Windows Error Reporting",
  "Microsoft-Windows-WER-SystemErrorReporting",
  "Microsoft-Windows-Kernel-Power",
  "EventLog",
  "Microsoft-Windows-WHEA-Logger",
  "Display",
  "Disk",
  "Ntfs",
  "storahci",
  "stornvme",
  "nvme",
];

function numberArg(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = args[key];
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function requestedLogs(args: Record<string, unknown>): string[] {
  const logs = Array.isArray(args.logs) ? args.logs.map(String) : ["Application", "System"];
  const filtered = logs.filter((log) => ALLOWED_LOGS.has(log));
  return filtered.length > 0 ? [...new Set(filtered)] : ["Application", "System"];
}

function emptySummary(sinceDays: number, warning?: string): WindowsEventSummaryResult {
  return {
    sinceDays,
    events: [],
    summary: {
      applicationCrashes: 0,
      unexpectedShutdowns: 0,
      hardwareErrors: 0,
      diskErrors: 0,
    },
    warning,
  };
}

function snippet(input: unknown): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function summarize(events: WindowsEventSummaryEntry[]): WindowsEventSummaryResult["summary"] {
  return {
    applicationCrashes: events.filter((event) => event.providerName === "Application Error" || event.providerName === "Windows Error Reporting" || event.eventId === 1000 || event.eventId === 1001).length,
    unexpectedShutdowns: events.filter((event) => event.providerName.includes("Kernel-Power") || event.eventId === 41 || event.eventId === 6008).length,
    hardwareErrors: events.filter((event) => event.providerName.includes("WHEA") || [17, 18, 19, 20, 47].includes(event.eventId)).length,
    diskErrors: events.filter((event) => /disk|ntfs|storahci|stornvme|nvme/i.test(event.providerName) || [7, 51, 55, 129, 153, 157].includes(event.eventId)).length,
  };
}

async function runFixedPowerShellEventQuery(sinceDays: number, logs: string[], maxEvents: number): Promise<WindowsEventSummaryEntry[]> {
  const logsLiteral = logs.map((log) => `'${log.replace(/'/g, "''")}'`).join(",");
  const providersLiteral = WATCH_PROVIDERS.map((provider) => `'${provider.replace(/'/g, "''")}'`).join(",");
  const command = `
$ErrorActionPreference = 'Stop'
$since = (Get-Date).AddDays(-${sinceDays})
$logs = @(${logsLiteral})
$providers = @(${providersLiteral})
$ids = @(1000,1001,41,6008,17,18,19,20,47,7,51,55,129,153,157)
$all = foreach ($log in $logs) {
  Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = $since } -ErrorAction SilentlyContinue |
    Where-Object { $_.LevelDisplayName -in @('Error','Critical') -or $providers -contains $_.ProviderName -or $ids -contains $_.Id } |
    Select-Object -First ${maxEvents} @{Name='timeCreated';Expression={$_.TimeCreated.ToString('o')}}, @{Name='logName';Expression={$_.LogName}}, @{Name='providerName';Expression={$_.ProviderName}}, @{Name='eventId';Expression={$_.Id}}, @{Name='level';Expression={$_.LevelDisplayName}}, @{Name='messageSnippet';Expression={ if ($_.Message) { ($_.Message -replace '\\s+',' ').Substring(0, [Math]::Min(500, ($_.Message -replace '\\s+',' ').Length)) } else { '' } }}
}
$all | Sort-Object timeCreated -Descending | Select-Object -First ${maxEvents} | ConvertTo-Json -Depth 4 -Compress
`;

  return new Promise((resolvePromise, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: false,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Windows event query timed out"));
    }, 30_000);

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
    child.on("close", (exitCode: number | null) => {
      clearTimeout(timer);
      if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `Get-WinEvent failed with exit code ${exitCode}`));
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        resolvePromise([]);
        return;
      }

      const parsed = JSON.parse(trimmed) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      resolvePromise(items.map((item) => {
        const event = item as Record<string, unknown>;
        return {
          timeCreated: String(event.timeCreated ?? ""),
          logName: String(event.logName ?? ""),
          providerName: String(event.providerName ?? ""),
          eventId: Number(event.eventId ?? 0),
          level: String(event.level ?? ""),
          messageSnippet: snippet(event.messageSnippet),
        };
      }));
    });
  });
}

export async function windowsEventSummary(args: Record<string, unknown>): Promise<WindowsEventSummaryResult> {
  if ("command" in args) {
    throw new Error("windows_event_summary does not accept arbitrary command input");
  }

  const sinceDays = numberArg(args, "sinceDays", 14, 1, 90);
  const logs = requestedLogs(args);
  const maxEvents = numberArg(args, "maxEvents", 200, 1, 500);

  if (process.platform !== "win32") {
    return emptySummary(sinceDays, "windows_event_summary is only available on Windows; no query was run on this platform.");
  }

  try {
    const events = await runFixedPowerShellEventQuery(sinceDays, logs, maxEvents);
    return {
      sinceDays,
      events,
      summary: summarize(events),
    };
  } catch (error) {
    return emptySummary(sinceDays, error instanceof Error ? error.message : "Windows event query failed");
  }
}
