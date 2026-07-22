import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditLog } from "./audit.ts";
import {
  DEFAULT_HOST,
  LOCAL_MCP_TOOL_NAMES,
  REMOTE_MCP_TOOL_NAMES,
  TOOL_NAMES,
  isRemoteDevNoAuthEnabled,
  loadConfig,
  loadRemoteMcpConfig,
} from "./config.ts";
import { TOOL_REGISTRY, getToolMetadata, invokeTool } from "./mcp/tool-registry.ts";
import { createDiagBridgeMcpServer } from "./mcp/server-factory.ts";
import { createSession, isRemoteMcpRequestAuthorized, isRequestAuthorized } from "./session.ts";
import { listDir, readFile, resolveBridgePath } from "./tools/file-tools.ts";
import { driveInventory } from "./tools/drive-inventory.ts";
import { DANGEROUS_CLEANUP_ROOTS, junkCandidates } from "./tools/junk-candidates.ts";
import { summarizeWindowsEvents, windowsEventSummary } from "./tools/windows-events.ts";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("Tool registry keys match TOOL_NAMES exactly and each item has schema, annotations, and handler", () => {
  const registryKeys = Object.keys(TOOL_REGISTRY).sort();
  const expectedKeys = [...TOOL_NAMES].sort();
  assert.deepEqual(registryKeys, expectedKeys);

  for (const toolName of TOOL_NAMES) {
    const def = TOOL_REGISTRY[toolName];
    assert.ok(def, `Tool ${toolName} should be present in TOOL_REGISTRY`);
    assert.equal(def.name, toolName);
    assert.ok(def.title && typeof def.title === "string");
    assert.ok(def.description && typeof def.description === "string");
    assert.ok(def.zodSchema && typeof def.zodSchema === "object");
    assert.ok(def.annotations && typeof def.annotations === "object");
    assert.equal(typeof def.annotations.readOnlyHint, "boolean");
    assert.equal(typeof def.annotations.destructiveHint, "boolean");
    assert.equal(typeof def.annotations.openWorldHint, "boolean");
    assert.equal(typeof def.handler, "function");
  }
});

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

test("Remote MCP defaults only expose the four read-only diagnostic tools", () => {
  assert.deepEqual(REMOTE_MCP_TOOL_NAMES, ["system_info", "drive_inventory", "junk_candidates", "windows_event_summary"]);
  assert.equal(REMOTE_MCP_TOOL_NAMES.includes("read_file" as never), false);
  assert.equal(REMOTE_MCP_TOOL_NAMES.includes("write_file" as never), false);
  assert.equal(REMOTE_MCP_TOOL_NAMES.includes("run_command" as never), false);
  assert.deepEqual(loadRemoteMcpConfig({}).enabledTools, REMOTE_MCP_TOOL_NAMES);
  assert.equal(loadRemoteMcpConfig({}).writeFileEnabled, false);
  assert.equal(loadRemoteMcpConfig({}).runCommandEnabled, false);
});

test("Remote transport cannot register write_file or run_command even if DIAGBRIDGE_MCP_TOOLS/DIAGBRIDGE_TOOLS env var is set", () => {
  const remoteConfig = loadRemoteMcpConfig({ DIAGBRIDGE_MCP_TOOLS: "system_info,write_file,run_command" });
  assert.deepEqual(remoteConfig.enabledTools, REMOTE_MCP_TOOL_NAMES);
  assert.equal(remoteConfig.enabledTools.includes("write_file" as never), false);
  assert.equal(remoteConfig.enabledTools.includes("run_command" as never), false);
  assert.equal(remoteConfig.writeFileEnabled, false);
  assert.equal(remoteConfig.runCommandEnabled, false);
});

test("stdio transport defaults to read-only tools and allows opt-in via DIAGBRIDGE_MCP_TOOLS", () => {
  const defaultConfig = loadConfig({});
  assert.equal(defaultConfig.enabledTools.includes("write_file" as never), false);
  assert.equal(defaultConfig.enabledTools.includes("run_command" as never), false);

  const customConfig = loadConfig({ DIAGBRIDGE_MCP_TOOLS: "system_info,list_dir,read_file,write_file,run_command" });
  assert.ok(customConfig.enabledTools.includes("write_file"));
  assert.ok(customConfig.enabledTools.includes("run_command"));
  assert.equal(customConfig.writeFileEnabled, true);
  assert.equal(customConfig.runCommandEnabled, true);
});

test("default host is localhost", () => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
  assert.equal(loadConfig({}).host, "127.0.0.1");
  assert.equal(loadRemoteMcpConfig({}).host, "127.0.0.1");
});

test("Remote MCP requires token by default and dev no-auth is explicit with deprecation warnings for old env vars", () => {
  const session = createSession("test-token");
  const defaultConfig = loadRemoteMcpConfig({});
  const noAuthConfig = loadRemoteMcpConfig({ DIAGBRIDGE_REMOTE_DEV_NO_AUTH: "1" });

  assert.equal(isRemoteDevNoAuthEnabled({}), false);
  assert.equal(defaultConfig.remoteDevNoAuth, false);
  assert.equal(isRemoteMcpRequestAuthorized({}, session, defaultConfig.remoteDevNoAuth), false);
  assert.equal(isRemoteMcpRequestAuthorized({ authorization: "Bearer test-token" }, session, defaultConfig.remoteDevNoAuth), true);

  assert.equal(noAuthConfig.remoteDevNoAuth, true);
  assert.equal(isRemoteMcpRequestAuthorized({}, session, noAuthConfig.remoteDevNoAuth), true);
  assert.deepEqual(noAuthConfig.enabledTools, REMOTE_MCP_TOOL_NAMES);
  assert.equal(noAuthConfig.writeFileEnabled, false);
  assert.equal(noAuthConfig.runCommandEnabled, false);

  // Deprecated env var check
  const deprecatedConfig = loadRemoteMcpConfig({ DIAGBRIDGE_HTTP_DEV_NO_AUTH: "1" });
  assert.equal(deprecatedConfig.remoteDevNoAuth, true);
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

test("invokeTool invokes handlers from registry correctly", async () => {
  const config = loadConfig({});
  const result = (await invokeTool("system_info", {}, config)) as Record<string, unknown>;
  assert.ok(result);
  assert.equal(result.visibleBridge, true);
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
  const metadata = Object.fromEntries(getToolMetadata().map((tool) => [tool.name, tool]));
  assert.equal(Object.hasOwn(metadata.windows_event_summary.inputSchema.properties as Record<string, unknown>, "command"), false);
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

test("consecutive independent HTTP MCP requests in stateless mode work correctly", async () => {
  const config = loadRemoteMcpConfig({ DIAGBRIDGE_REMOTE_DEV_NO_AUTH: "1" });
  const audit = new AuditLog();

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const mcpServer = createDiagBridgeMcpServer(config, audit, REMOTE_MCP_TOOL_NAMES);

      let cleanedUp = false;
      const cleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true;
          Promise.allSettled([
            transport.close(),
            mcpServer.close(),
          ]).catch(() => {});
        }
      };

      res.once("finish", cleanup);
      res.once("close", cleanup);

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/mcp`;

  try {
    // Request 1: tools/list
    const res1 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    assert.equal(res1.status, 200);
    const body1Str = await res1.text();
    assert.match(body1Str, /system_info/);
    assert.match(body1Str, /windows_event_summary/);

    // Request 2: tools/list again (consecutive independent request)
    const res2 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });

    assert.equal(res2.status, 200);
    const body2Str = await res2.text();
    assert.match(body2Str, /system_info/);
    assert.match(body2Str, /windows_event_summary/);
  } finally {
    server.close();
  }
});

test("real stdio MCP client integration verifies initialize, tools/list, system_info, tool filtering, and clean stdout", async () => {
  const envClean = { ...process.env };
  delete envClean.DIAGBRIDGE_MCP_TOOLS;
  delete envClean.DIAGBRIDGE_TOOLS;

  const transport = new StdioClientTransport({
    command: "node",
    args: ["--experimental-strip-types", join(process.cwd(), "src/mcp/transports/stdio.ts")],
    env: envClean as Record<string, string>,
  });


  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  try {
    const listResult = await client.listTools();
    const toolNames = listResult.tools.map((tool) => tool.name);

    assert.equal(toolNames.length, 6);
    assert.deepEqual(toolNames.sort(), [...LOCAL_MCP_TOOL_NAMES].sort());
    assert.equal(toolNames.includes("write_file"), false);
    assert.equal(toolNames.includes("run_command"), false);

    const callResult = await client.callTool({ name: "system_info", arguments: {} });
    assert.equal(callResult.isError, undefined);
    assert.ok(Array.isArray(callResult.content));
    assert.match((callResult.content[0] as { text: string }).text, /visibleBridge/);
  } finally {
    await client.close();
  }
});

test("real stdio MCP client allows write_file and run_command when DIAGBRIDGE_MCP_TOOLS is explicitly set", async () => {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--experimental-strip-types", join(process.cwd(), "src/mcp/transports/stdio.ts")],
    env: {
      ...process.env,
      DIAGBRIDGE_MCP_TOOLS: "system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file,run_command",
    },
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  try {
    const listResult = await client.listTools();
    const toolNames = listResult.tools.map((tool) => tool.name);

    assert.equal(toolNames.length, 8);
    assert.ok(toolNames.includes("write_file"));
    assert.ok(toolNames.includes("run_command"));
  } finally {
    await client.close();
  }
});
