import { appendFile } from "node:fs/promises";

export type AuditStatus = "ok" | "denied" | "error";

export interface AuditEvent {
  id: string;
  timestamp: string;
  toolName: string;
  paramSummary: string;
  status: AuditStatus;
  message?: string;
}

export interface AuditRecordInput {
  toolName: string;
  params: Record<string, unknown>;
  status: AuditStatus;
  message?: string;
}

function summarizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(summarizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, entryValue]) => {
          if (/password|token|secret|key/i.test(key)) {
            return [key, "[redacted-summary]"];
          }
          return [key, summarizeValue(entryValue)];
        }),
    );
  }

  if (typeof value === "string" && value.length > 200) {
    return `${value.slice(0, 200)}...`;
  }

  return value;
}

export function summarizeParams(params: Record<string, unknown>): string {
  return JSON.stringify(summarizeValue(params));
}

export class AuditLog {
  readonly events: AuditEvent[] = [];
  readonly logPath?: string;

  constructor(logPath?: string) {
    this.logPath = logPath;
  }

  async record(input: AuditRecordInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: `audit-${Date.now()}-${this.events.length}`,
      timestamp: new Date().toISOString(),
      toolName: input.toolName,
      paramSummary: summarizeParams(input.params),
      status: input.status,
      message: input.message,
    };

    this.events.push(event);

    if (this.logPath) {
      await appendFile(this.logPath, `${JSON.stringify(event)}\n`, "utf8");
    }

    return event;
  }
}
