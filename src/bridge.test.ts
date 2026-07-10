import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditLog } from "./audit.ts";
import {
  DEFAULT_HOST,
  HTTP_CONNECTOR_TOOL_NAMES,
  isHttpDevNoAuthEnabled,
  loadConfig,
  loadHttpMcpConfig,
} from "./config.ts";
import { createSession, isHttpConnectorRequestAuthorized, isRequestAuthorized } from "./session.ts";
import { listDir, readFile, resolveBridgePath } from "./tools/file-tools.ts";
import { getToolMetadata } from "./tools/index.ts";
import { driveInventory } from "./tools/drive-inventory.ts";
import { DANGEROUS_CLEANUP_ROOTS, junkCandidates } from "./tools/junk-candidates.ts";
import { summarizeWindowsEvents, windowsEventSummaryTool, windowsEventSummary } from "./tools/windows-events.ts";

test("MCP tool metadata marks read-only and destructive/open-world tools correctly", () => {
  const metadata = Object.fromEntries(getToolMetadata().map((tool) => [tool.name, tool]));

  assert.equal(metadata.system_info.annotations.readOnlyHint, true);
  assert.equal(metadata.list_dir.annotations.readOnlyHint, true);
  assert.equal(metadata.read_file.annotations.readOnlyHint, true);
  assert.equal(metadata.drive_inventory.annotations.readOnlyHint, true);
  assert.equal(metadata.junk_candidates.annotations.readOnlyHint, true);
  assert.equal(metadata.windows_event_summary.annotations.readOnlyHint, true);

  assert.equal(metadata.write_file.annotations.destructiveHint, true);
  assert.equal(metadata.write_file.annotations.openWorldHint, false);

  assert.equal(metadata.run_command.annotations.destructiveHint, true);
  assert.equal(metadata.run_command.annotations.openWorldHint, true);
});

test("HTTP connector defaults only expose the four read-only diagnostic tools", () => {
  assert.deepEqual(HTTP_CONNECTOR_TOOL_NAMES, ["system_info", "drive_inventory", "junk_candidates", "windows_event_summary"]);
  assert.equal(HTTP_CONNECTOR_TOOL_NAMES.includes("read_file" as never), false);
  assert.equal(HTTP_CONNECTOR_TOOL_NAMES.includes("write_file" as never), false);
  assert.equal(HTTP_CONNECTOR_TOOL_NAMES.includes("run_command" as never), false);
  assert.deepEqual(loadHttpMcpConfig({}).enabledTools, HTTP_CONNECTOR_TOOL_NAMES);
  assert.equal(loadHttpMcpConfig({}).writeFileEnabled, false);
  assert.equal(loadHttpMcpConfig({}).runCommandEnabled, false);
});

test("default host is localhost", () => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
  assert.equal(loadConfig({}).host, "127.0.0.1");
  assert.equal(loadHttpMcpConfig({}).host, "127.0.0.1");
});

test("HTTP connector requires token by default and dev no-auth is explicit", () => {
  const session = createSession("test-token");
  const defaultConfig = loadHttpMcpConfig({});
  const noAuthConfig = loadHttpMcpConfig({ DIAGBRIDGE_HTTP_DEV_NO_AUTH: "1" });

  assert.equal(isHttpDevNoAuthEnabled({}), false);
  assert.equal(defaultConfig.httpDevNoAuth, false);
  assert.equal(isHttpConnectorRequestAuthorized({}, session, defaultConfig.httpDevNoAuth), false);
  assert.equal(isHttpConnectorRequestAuthorized({ authorization: "Bearer test-token" }, session, defaultConfig.httpDevNoAuth), true);

  assert.equal(noAuthConfig.httpDevNoAuth, true);
  assert.equal(isHttpConnectorRequestAuthorized({}, session, noAuthConfig.httpDevNoAuth), true);
  assert.deepEqual(noAuthConfig.enabledTools, HTTP_CONNECTOR_TOOL_NAMES);
  assert.equal(noAuthConfig.writeFileEnabled, false);
  assert.equal(noAuthConfig.runCommandEnabled, false);
});

test("missing session token rejects protected requests", () => {
  const session = createSession("test-token");

  assert.equal(isRequestAuthorized({}, session), false);
  assert.equal(isRequestAuthorized({ authorization: "Bearer wrong" }, session), false);
  assert.equal(isRequestAuthorized({ authorization: "Bearer test-token" }, session), true);
  assert.equal(isRequestAuthorized({ "x-diagbridge-session-token": "test-token" }, session), true);
});

test("audit log records tool name, parameter summary, timestamp, and status", async () => {
  const audit = new AuditLog();
  const event = await audit.record({
    toolName: "read_file",
    params: { path: "notes.txt", token: "secret-value" },
    status: "ok",
  });

  assert.equal(audit.events.length, 1);
  assert.equal(event.toolName, "read_file");
  assert.equal(event.status, "ok");
  assert.match(event.timestamp, /\d{4}-\d{2}-\d{2}T/);
  assert.match(event.paramSummary, /notes\.txt/);
  assert.match(event.paramSummary, /redacted-summary/);
});

test("list_dir and read_file handle basic paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "diagbridge-test-"));
  try {
    await writeFile(join(dir, "hello.txt"), "hello bridge", "utf8");

    const resolved = resolveBridgePath("hello.txt", dir);
    assert.equal(resolved, join(dir, "hello.txt"));

    const listing = await listDir({ path: "." }, dir);
    assert.ok(listing.entries.some((entry) => entry.name === "hello.txt" && entry.type === "file"));

    const content = await readFile({ path: "hello.txt" }, dir);
    assert.equal(content.content, "hello bridge");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("drive_inventory scans metadata without reading file contents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "diagbridge-inventory-"));
  try {
    await writeFile(join(dir, "secret.txt"), "do not include this content", "utf8");
    const result = await driveInventory({ root: dir, maxDepth: 1, maxEntries: 10, maxSeconds: 5 });

    assert.equal(result.scannedEntries, 1);
    assert.equal(result.entries[0].name, "secret.txt");
    assert.equal(result.entries[0].type, "file");
    assert.equal(Object.hasOwn(result.entries[0], "content"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("drive_inventory honors maxEntries and maxDepth truncation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "diagbridge-depth-"));
  try {
    await writeFile(join(dir, "a.txt"), "a", "utf8");
    await writeFile(join(dir, "b.txt"), "b", "utf8");
    const result = await driveInventory({ root: dir, maxDepth: 0, maxEntries: 1, maxSeconds: 5 });

    assert.equal(result.entries.length, 1);
    assert.equal(result.truncated, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dangerous cleanup roots use corrected Minecraft and Packages paths", () => {
  assert.ok(DANGEROUS_CLEANUP_ROOTS.includes("%APPDATA%\\.minecraft"));
  assert.ok(DANGEROUS_CLEANUP_ROOTS.includes("%LOCALAPPDATA%\\Packages"));
  assert.equal(DANGEROUS_CLEANUP_ROOTS.includes("%APPDATA%\\Roaming\\.minecraft"), false);
  assert.equal(DANGEROUS_CLEANUP_ROOTS.includes("%APPDATA%\\Local\\Packages"), false);
});

test("junk_candidates does not delete and returns review_only candidates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "diagbridge-junk-"));
  const tempFile = join(dir, "old.tmp");
  try {
    await writeFile(tempFile, "temporary", "utf8");
    const oldDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await utimes(tempFile, oldDate, oldDate);
    const result = await junkCandidates({ roots: [dir], olderThanDays: 1, maxEntries: 10 }, dir);

    await stat(tempFile);
    assert.ok(result.candidates.length >= 1);
    assert.ok(result.candidates.every((candidate) => candidate.recommendedAction === "review_only"));
    assert.match(result.note, /did not delete/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("windows_event_summary does not accept arbitrary command input", async () => {
  assert.equal(Object.hasOwn(windowsEventSummaryTool.inputSchema.properties as Record<string, unknown>, "command"), false);
  await assert.rejects(() => windowsEventSummary({ command: "Get-Process" }), /does not accept arbitrary command/i);
});

test("windows event summary assigns each event to one matching diagnostic category", () => {
  const event = (logName: string, providerName: string, eventId: number) => ({
    logName,
    providerName,
    eventId,
    timeCreated: "2026-07-10T00:00:00.000Z",
    level: "Information",
    messageSnippet: "",
  });

  const summary = summarizeWindowsEvents([
    event("System", "Microsoft-Windows-WindowsUpdateClient", 19),
    event("System", "Microsoft-Windows-Kernel-Power", 42),
    event("System", "Microsoft-Windows-Kernel-Power", 41),
    event("System", "Microsoft-Windows-WHEA-Logger", 17),
    event("System", "Disk", 17),
    event("Application", "Application Error", 1000),
    event("System", "EventLog", 6008),
  ]);

  assert.deepEqual(summary, {
    applicationCrashes: 1,
    unexpectedShutdowns: 2,
    hardwareErrors: 1,
    diskErrors: 1,
  });
});
