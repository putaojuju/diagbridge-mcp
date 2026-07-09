import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditLog } from "./audit.ts";
import { DEFAULT_HOST, loadConfig } from "./config.ts";
import { createSession, isRequestAuthorized } from "./session.ts";
import { listDir, readFile, resolveBridgePath } from "./tools/file-tools.ts";
import { getToolMetadata } from "./tools/index.ts";

test("tool metadata marks read-only and destructive/open-world tools correctly", () => {
  const metadata = Object.fromEntries(getToolMetadata().map((tool) => [tool.name, tool]));

  assert.equal(metadata.system_info.annotations.readOnlyHint, true);
  assert.equal(metadata.list_dir.annotations.readOnlyHint, true);
  assert.equal(metadata.read_file.annotations.readOnlyHint, true);

  assert.equal(metadata.write_file.annotations.destructiveHint, true);
  assert.equal(metadata.write_file.annotations.openWorldHint, false);

  assert.equal(metadata.run_command.annotations.destructiveHint, true);
  assert.equal(metadata.run_command.annotations.openWorldHint, true);
});

test("default host is localhost", () => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
  assert.equal(loadConfig({}).host, "127.0.0.1");
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
