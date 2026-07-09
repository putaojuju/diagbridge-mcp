import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditLog } from "./audit.ts";
import { DEFAULT_HOST, HTTP_CONNECTOR_TOOL_NAMES, loadConfig, loadHttpMcpConfig } from "./config.ts";
import { createSession, isRequestAuthorized } from "./session.ts";
import { listDir, readFile, resolveBridgePath } from "./tools/file-tools.ts";
import { getToolMetadata } from "./tools/index.ts";
import { driveInventory } from "./tools/drive-inventory.ts";
import { junkCandidates } from "./tools/junk-candidates.ts";
import { windowsEventSummaryTool, windowsEventSummary } from "./tools/windows-events.ts";

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

test("HTTP connector defaults only expose read-only diagnostic tools", () => {
  assert.deepEqual(HTTP_CONNECTOR_TOOL_NAMES, ["system_info", "drive_inventory", "junk_candidates", "windows_event_summary"]);
  assert.deepEqual(loadHttpMcpConfig({}).enabledTools, HTTP_CONNECTOR_TOOL_NAMES);
  assert.equal(loadHttpMcpConfig({}).writeFileEnabled, false);
  assert.equal(loadHttpMcpConfig({}).runCommandEnabled, false);
});

test("default host is localhost", () => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
  assert.equal(loadConfig({}).host, "127.0.0.1");
  assert.equal(loadHttpMcpConfig({}).host, "127.0.0.1");
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
