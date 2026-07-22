import { spawn } from "node:child_process";
import * as z from "zod/v4";
import type { ToolDefinition } from "../mcp/types.ts";

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
  returnedEventRecords: number;
  maxEvents: number;
  truncated: boolean;
  countMeaning: "event_records_not_unique_incidents";
  summaryScope: "returned_event_records";
  summary: {
    applicationCrashEvents: number;
    unexpectedShutdownEvents: number;
    hardwareErrorEvents: number;
    diskErrorEvents: number;
  };
  events: WindowsEventSummaryEntry[];
  warning?: string;
}

const ALLOWED_LOGS = new Set(["Application", "System"]);
const WATCH_PROVIDERS = [
  "Application Error",
  "Windows Error Reporting",
  "Microsoft-Windows-WER-SystemErrorReporting",
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

function emptySummary(sinceDays: number, maxEvents: number, warning?: string): WindowsEventSummaryResult {
  return {
    sinceDays,
    returnedEventRecords: 0,
    maxEvents,
    truncated: false,
    countMeaning: "event_records_not_unique_incidents",
    summaryScope: "returned_event_records",
    summary: {
      applicationCrashEvents: 0,
      unexpectedShutdownEvents: 0,
      hardwareErrorEvents: 0,
      diskErrorEvents: 0,
    },
    events: [],
    warning,
  };
}

function snippet(input: unknown): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

type SummaryCategory = keyof WindowsEventSummaryResult["summary"];

function classifyEvent(event: WindowsEventSummaryEntry): SummaryCategory | undefined {
  const provider = event.providerName.toLowerCase();
  const isSystemLog = event.logName.toLowerCase() === "system";
  const isApplicationLog = event.logName.toLowerCase() === "application";

  if (
    (isApplicationLog && (provider === "application error" || provider === "windows error reporting" || provider.includes("wer"))) ||
    (isApplicationLog && [1000, 1001].includes(event.eventId))
  ) {
    return "applicationCrashEvents";
  }

  if (
    (provider.includes("kernel-power") && event.eventId === 41) ||
    (isSystemLog && provider === "eventlog" && event.eventId === 6008)
  ) {
    return "unexpectedShutdownEvents";
  }

  if (provider.includes("whea")) {
    return "hardwareErrorEvents";
  }

  if (/disk|ntfs|storahci|stornvme|nvme/i.test(provider)) {
    return "diskErrorEvents";
  }

  return undefined;
}

export function summarizeWindowsEvents(events: WindowsEventSummaryEntry[]): WindowsEventSummaryResult["summary"] {
  const summary = {
    applicationCrashEvents: 0,
    unexpectedShutdownEvents: 0,
    hardwareErrorEvents: 0,
    diskErrorEvents: 0,
  };

  for (const event of events) {
    const category = classifyEvent(event);
    if (category) {
      summary[category] += 1;
    }
  }

  return summary;
}

async function runFixedPowerShellEventQuery(sinceDays: number, logs: string[], queryLimit: number): Promise<WindowsEventSummaryEntry[]> {
  const logsLiteral = logs.map((log) => `'${log.replace(/'/g, "''")}'`).join(",");
  const providersLiteral = WATCH_PROVIDERS.map((provider) => `'${provider.replace(/'/g, "''")}'`).join(",");
  const command = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$since = (Get-Date).AddDays(-${sinceDays})
$logs = @(${logsLiteral})
$providers = @(${providersLiteral})
$limit = ${queryLimit}
$all = foreach ($log in $logs) {
  Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = $since } -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LevelDisplayName -in @('Error','Critical') -or
      $providers -contains $_.ProviderName -or
      ($_.ProviderName -eq 'Microsoft-Windows-Kernel-Power' -and $_.Id -eq 41) -or
      ($_.ProviderName -eq 'EventLog' -and $_.Id -eq 6008)
    } |
    Select-Object -First $limit @{Name='timeCreated';Expression={$_.TimeCreated.ToString('o')}}, @{Name='logName';Expression={$_.LogName}}, @{Name='providerName';Expression={$_.ProviderName}}, @{Name='eventId';Expression={$_.Id}}, @{Name='level';Expression={$_.LevelDisplayName}}, @{Name='messageSnippet';Expression={ if ($_.Message) { ($_.Message -replace '\\s+',' ').Substring(0, [Math]::Min(500, ($_.Message -replace '\\s+',' ').Length)) } else { '' } }}
}
$all | Sort-Object timeCreated -Descending | Select-Object -First $limit | ConvertTo-Json -Depth 4 -Compress
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
    return emptySummary(sinceDays, maxEvents, "windows_event_summary is only available on Windows; no query was run on this platform.");
  }

  try {
    const rawEvents = await runFixedPowerShellEventQuery(sinceDays, logs, maxEvents + 1);
    const truncated = rawEvents.length > maxEvents;
    const events = truncated ? rawEvents.slice(0, maxEvents) : rawEvents;

    return {
      sinceDays,
      returnedEventRecords: events.length,
      maxEvents,
      truncated,
      countMeaning: "event_records_not_unique_incidents",
      summaryScope: "returned_event_records",
      summary: summarizeWindowsEvents(events),
      events,
    };
  } catch (error) {
    return emptySummary(sinceDays, maxEvents, error instanceof Error ? error.message : "Windows event query failed");
  }
}

export const windowsEventSummaryDefinition: ToolDefinition = {
  name: "windows_event_summary",
  title: "Windows event summary",
  description: "Read recent Windows Application/System error events using a fixed read-only query. It does not accept arbitrary commands and does not auto-elevate.",
  zodSchema: {
    sinceDays: z.number().int().min(1).max(90).optional(),
    logs: z.array(z.enum(["Application", "System"])).optional(),
    maxEvents: z.number().int().min(1).max(500).optional(),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (args) => windowsEventSummary(args),
};
