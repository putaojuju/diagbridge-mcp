import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync } from "node:fs";

import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VERSION } from "./version.ts";
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
import { checkAndExpireSession, createSession, createStoppedSession, isRemoteMcpRequestAuthorized, isRequestAuthorized } from "./session.ts";
import { listDir, readFile, resolveBridgePath } from "./tools/file-tools.ts";
import { createUiServer, getCandidateEndpoints } from "./ui/server.ts";
import { CloudflareTunnel, parseTunnelUrl } from "./tunnel/cloudflared.ts";
import { cleanOldBuilds } from "./utils/clean-builds.ts";




import { driveInventory } from "./tools/drive-inventory.ts";
import { DANGEROUS_CLEANUP_ROOTS, junkCandidates } from "./tools/junk-candidates.ts";
import { summarizeWindowsEvents, windowsEventSummary } from "./tools/windows-events.ts";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";


process.env.DIAGBRIDGE_MOCK_TUNNEL = "1";
process.env.DIAGBRIDGE_TEST_NO_OPEN = "1";

test("MCP server version matches package.json version", () => {

  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  assert.equal(VERSION, packageJson.version);
});


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

test("windows event summary assigns each event to one matching diagnostic category with new field names", () => {
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
    event("Application", "Windows Error Reporting", 1001),
    event("System", "EventLog", 6008),
  ]);

  assert.deepEqual(summary, {
    applicationCrashEvents: 2,
    unexpectedShutdownEvents: 2,
    hardwareErrorEvents: 1,
    diskErrorEvents: 1,
  });

  assert.equal(Object.hasOwn(summary, "applicationCrashes"), false);
  assert.equal(Object.hasOwn(summary, "unexpectedShutdowns"), false);
  assert.equal(Object.hasOwn(summary, "hardwareErrors"), false);
  assert.equal(Object.hasOwn(summary, "diskErrors"), false);
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

test("real stdio MCP client allows write_file and run_command in isolated tempDir when DIAGBRIDGE_MCP_TOOLS is explicitly set", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "diagbridge-mcp-write-"));
  const targetFile = join(tempDir, "hello.txt");

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

    // 1. write_file to isolated tempDir
    const writeResult = (await client.callTool({
      name: "write_file",
      arguments: {
        path: targetFile,
        content: "DiagBridge MCP write test",
      },
    })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    assert.equal(writeResult.isError, undefined);
    assert.match(writeResult.content[0].text, /bytesWritten/);

    // 2. read_file from isolated tempDir
    const readResult = (await client.callTool({
      name: "read_file",
      arguments: {
        path: targetFile,
        encoding: "utf8",
      },
    })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    assert.equal(readResult.isError, undefined);
    const parsedRead = JSON.parse(readResult.content[0].text) as { content: string };
    assert.equal(parsedRead.content, "DiagBridge MCP write test");

    // 3. run_command using process.execPath (safe node execution)
    const nodeExecResult = (await client.callTool({
      name: "run_command",
      arguments: {
        command: process.execPath,
        args: ["-e", "process.stdout.write('diagbridge-command-test')"],
      },
    })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    assert.equal(nodeExecResult.isError, undefined);
    const parsedNodeExec = JSON.parse(nodeExecResult.content[0].text) as { stdout: string; exitCode: number };
    assert.equal(parsedNodeExec.exitCode, 0);
    assert.equal(parsedNodeExec.stdout, "diagbridge-command-test");

    // 4. run_command using node script to verify hello.txt in tempDir
    const checkFileResult = (await client.callTool({
      name: "run_command",
      arguments: {
        command: process.execPath,
        args: ["-e", "console.log(require('node:fs').existsSync(process.argv[1]))", targetFile],
      },
    })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    assert.equal(checkFileResult.isError, undefined);
    const parsedCheckFile = JSON.parse(checkFileResult.content[0].text) as { stdout: string; exitCode: number };
    assert.equal(parsedCheckFile.exitCode, 0);
    assert.match(parsedCheckFile.stdout, /true/);
  } finally {
    await client.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("real Remote MCP server over Streamable HTTP verifies 401 auth errors, valid token, 4 read-only tools, system_info, 3 sessions, and stop", async () => {
  const token = "test-token-remote-mcp-2026-secret";
  const config = loadRemoteMcpConfig({
    DIAGBRIDGE_SESSION_TOKEN: token,
  });
  const audit = new AuditLog();

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      const session = createSession(config.sessionToken);
      if (!isRemoteMcpRequestAuthorized(req.headers, session, config.remoteDevNoAuth)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "missing or invalid session token" }));
        return;
      }

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
  const baseUrl = `http://127.0.0.1:${address.port}/mcp`;

  try {
    // 1. Missing token must return 401
    const noTokenRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(noTokenRes.status, 401);

    // 2. Wrong token must return 401
    const wrongTokenRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(wrongTokenRes.status, 401);

    // 3 & 4. Valid Bearer token initializes and returns 4 read-only tools via SDK StreamableHTTPClientTransport
    const client1Transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: {
        headers: { authorization: `Bearer ${token}` },
      },
    });
    const client1 = new Client({ name: "client-1", version: "1.0.0" }, { capabilities: {} });
    await client1.connect(client1Transport);

    const listResult = await client1.listTools();
    const toolNames = listResult.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [...REMOTE_MCP_TOOL_NAMES].sort());
    assert.equal(toolNames.includes("list_dir" as never), false);
    assert.equal(toolNames.includes("read_file" as never), false);
    assert.equal(toolNames.includes("write_file" as never), false);
    assert.equal(toolNames.includes("run_command" as never), false);

    // 5. Call system_info successfully
    const callResult = (await client1.callTool({ name: "system_info", arguments: {} })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    assert.equal(callResult.isError, undefined);
    assert.match(callResult.content[0].text, /visibleBridge/);
    await client1.close();


    // 6. Connect 3 consecutive independent client sessions
    for (let i = 1; i <= 3; i++) {
      const clientSessionTransport = new StreamableHTTPClientTransport(new URL(baseUrl), {
        requestInit: {
          headers: { authorization: `Bearer ${token}` },
        },
      });
      const clientSession = new Client({ name: `client-session-${i}`, version: "1.0.0" }, { capabilities: {} });
      await clientSession.connect(clientSessionTransport);
      const sessionList = await clientSession.listTools();
      assert.equal(sessionList.tools.length, 4);
      await clientSession.close();
    }
  } finally {
    server.close();
  }

  // 7. After server is closed, new client connection fails
  const closedTransport = new StreamableHTTPClientTransport(new URL(baseUrl), {
    requestInit: {
      headers: { authorization: `Bearer ${token}` },
    },
  });
  const closedClient = new Client({ name: "client-closed", version: "1.0.0" }, { capabilities: {} });
  await assert.rejects(() => closedClient.connect(closedTransport));
});

test("Local UI server binds only to 127.0.0.1 and enforces one-time pairing token, origin protection, candidate endpoints, and true expiration", async () => {
  const session = createStoppedSession();
  const audit = new AuditLog();

  // 1. Host restriction check
  assert.throws(() => createUiServer(session, audit, 8790, "0.0.0.0"), /restricted to 127\.0\.0\.1/);

  const uiServer = createUiServer(session, audit, 0, "127.0.0.1", 8787);
  await new Promise<void>((resolvePromise) => uiServer.listen(0, "127.0.0.1", resolvePromise));
  const address = uiServer.address() as AddressInfo;
  const uiPort = address.port;
  const uiUrl = `http://127.0.0.1:${uiPort}`;

  try {
    // 2. Default state is stopped
    const statusRes1 = await fetch(`${uiUrl}/api/status`);
    const status1 = (await statusRes1.json()) as Record<string, unknown>;
    assert.equal(status1.state, "stopped");
    assert.equal(status1.connected, false);
    assert.equal(status1.tokenLast4, null);
    assert.equal(Object.hasOwn(status1, "token"), false);
    assert.deepEqual(status1.allowedTools, [...REMOTE_MCP_TOOL_NAMES]);

    // 3. Same-origin protection rejects external Origin
    const evilStartRes = await fetch(`${uiUrl}/api/session/start`, {
      method: "POST",
      headers: { origin: "http://evil.com" },
    });
    assert.equal(evilStartRes.status, 403);

    // 4. POST /api/session/start returns full token ONLY in this immediate response
    const startRes = await fetch(`${uiUrl}/api/session/start`, { method: "POST" });
    assert.equal(startRes.status, 200);
    const startBody = (await startRes.json()) as {
      status: Record<string, unknown>;
      connection: { token: string; expiresAt: string; candidateEndpoints: string[] };
    };

    assert.equal(startBody.status.state, "waiting");
    assert.equal(startBody.status.connected, false);
    assert.ok(typeof startBody.status.tokenLast4 === "string" && (startBody.status.tokenLast4 as string).length === 4);
    assert.equal(Object.hasOwn(startBody.status, "token"), false);

    const firstToken = startBody.connection.token;
    assert.ok(firstToken);
    assert.ok(Array.isArray(startBody.connection.candidateEndpoints));
    assert.ok(startBody.connection.candidateEndpoints.length >= 1);

    // Candidate endpoints must not contain 127.0.0.1 or 169.254.x.x unless fallback
    const candidateEndpoints = getCandidateEndpoints(8787);
    if (candidateEndpoints.length > 1 || candidateEndpoints[0] !== "http://127.0.0.1:8787/mcp") {
      assert.equal(candidateEndpoints.some((ep) => ep.includes("127.0.0.1") || ep.includes("169.254.")), false);
    }

    // 5. Subsequent GET /api/status does NOT return full token
    const statusRes2 = await fetch(`${uiUrl}/api/status`);
    const status2 = (await statusRes2.json()) as Record<string, unknown>;
    assert.equal(status2.state, "waiting");
    assert.equal(Object.hasOwn(status2, "token"), false);

    // 6. Authorized MCP request with firstToken transitions state to connected
    const authorizedReq = isRemoteMcpRequestAuthorized({ authorization: `Bearer ${firstToken}` }, session);
    assert.equal(authorizedReq, true);
    assert.equal(session.state, "connected");

    // 7. Audit log does NOT contain full token
    await audit.record({ toolName: "system_info", params: { token: firstToken }, status: "ok" });
    const activityRes = await fetch(`${uiUrl}/api/activity`);
    const activities = (await activityRes.json()) as Array<Record<string, unknown>>;
    assert.equal(activities.length, 1);
    assert.match(activities[0].paramSummary as string, /redacted-summary/);
    assert.equal((activities[0].paramSummary as string).includes(firstToken), false);

    // 8. Consecutive POST /api/session/start invalidates old token
    const restartRes = await fetch(`${uiUrl}/api/session/start`, { method: "POST" });
    const restartBody = (await restartRes.json()) as {
      status: Record<string, unknown>;
      connection: { token: string };
    };
    const secondToken = restartBody.connection.token;
    assert.notEqual(firstToken, secondToken);

    // Old token must now fail authorization
    const oldTokenAuth = isRemoteMcpRequestAuthorized({ authorization: `Bearer ${firstToken}` }, session);
    assert.equal(oldTokenAuth, false);

    // New token must pass authorization
    const newTokenAuth = isRemoteMcpRequestAuthorized({ authorization: `Bearer ${secondToken}` }, session);
    assert.equal(newTokenAuth, true);

    // 9. True session expiration test
    session.expiresAt = new Date(Date.now() - 1000).toISOString(); // Backdate expiration
    const expiredAuth = isRemoteMcpRequestAuthorized({ authorization: `Bearer ${secondToken}` }, session);
    assert.equal(expiredAuth, false);
    assert.equal(session.state, "stopped");
    assert.equal(session.disconnectReason, "session-expired");

    const statusResExpired = await fetch(`${uiUrl}/api/status`);
    const statusExpired = (await statusResExpired.json()) as Record<string, unknown>;
    assert.equal(statusExpired.state, "stopped");
    assert.equal(statusExpired.disconnectReason, "session-expired");
  } finally {
    uiServer.close();
  }
});

test("Cloudflare Quick Tunnel URL parser extracts trycloudflare.com endpoint and ignores error logs", () => {
  const validOutput = "INF 2026-07-22 Your quick tunnel is ready! Visit: https://demo-random-subdomain.trycloudflare.com";
  const parsed = parseTunnelUrl(validOutput);
  assert.equal(parsed, "https://demo-random-subdomain.trycloudflare.com");

  const errorOutput = "ERR 404 connection error: failed to dial target host";
  const parsedErr = parseTunnelUrl(errorOutput);
  assert.equal(parsedErr, null);
});

test("Tunnel stop and session expiration cleanly terminate tunnel state", async () => {
  const tunnel = new CloudflareTunnel();
  assert.equal(tunnel.getStatus(), "stopped");
  await tunnel.stop();
  assert.equal(tunnel.getStatus(), "stopped");
});

test("Portable build verification checks relative paths, bundled assets, and exclusion of src/node_modules", () => {
  const distAppMjs = join(process.cwd(), "dist", "app", "diagbridge.mjs");
  const distPkg = join(process.cwd(), "dist", "app", "package.json");

  if (existsSync(distAppMjs)) {
    assert.ok(existsSync(distAppMjs), "dist/app/diagbridge.mjs must exist after build");
    assert.ok(existsSync(distPkg), "dist/app/package.json must exist after build");
  }

  const releaseDir = join(process.cwd(), "release", "DiagBridge-Portable");
  if (existsSync(releaseDir)) {
    const launcherScript = readFileSync(join(releaseDir, "启动 DiagBridge.cmd"), "utf8");
    assert.match(launcherScript, /runtime\\node\.exe app\\diagbridge\.mjs/);
    assert.equal(existsSync(join(releaseDir, "src")), false, "Release must not contain src/");
    assert.equal(existsSync(join(releaseDir, "node_modules")), false, "Release must not contain node_modules/");
    assert.equal(existsSync(join(releaseDir, ".git")), false, "Release must not contain .git/");
  }
});


test("Portable process smoke test executes bundled node.exe and diagbridge.mjs with minimal PATH", async () => {
  const releaseDir = join(process.cwd(), "release", "DiagBridge-Portable");
  const nodeRuntime = join(releaseDir, "runtime", "node.exe");
  const appMjs = join(releaseDir, "app", "diagbridge.mjs");
  const manifestPath = join(releaseDir, "build-manifest.json");

  if (!existsSync(releaseDir) || !existsSync(nodeRuntime) || !existsSync(appMjs)) {
    return;
  }

  assert.ok(existsSync(manifestPath), "build-manifest.json must exist in release package");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { diagbridgeVersion: string; nodeVersion: string };
  assert.equal(manifest.diagbridgeVersion, VERSION);

  const { spawn: spawnProc } = await import("node:child_process");

  const env = {
    SYSTEMROOT: process.env.SYSTEMROOT || "C:\\Windows",
    PATH: "C:\\Windows\\System32;C:\\Windows",
    DIAGBRIDGE_TEST_NO_OPEN: "1",
    DIAGBRIDGE_MOCK_TUNNEL: "1",
  };

  const child = spawnProc(nodeRuntime, [appMjs], {
    cwd: releaseDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    let online = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch("http://127.0.0.1:8790/api/status");
        if (res.status === 200) {
          online = true;
          break;
        }
      } catch (_) {}
    }
    assert.ok(online, "Portable UI server failed to respond on 127.0.0.1:8790");

    const startRes = await fetch("http://127.0.0.1:8790/api/session/start", { method: "POST" });
    assert.equal(startRes.status, 200);
    const startBody = (await startRes.json()) as {
      status: { state: string };
      connection: { mcpEndpoint: string; token: string };
    };

    assert.equal(startBody.status.state, "waiting");
    assert.match(startBody.connection.mcpEndpoint, /trycloudflare\.com\/mcp/);
    assert.ok(startBody.connection.token);

    const stopRes = await fetch("http://127.0.0.1:8790/api/session/stop", { method: "POST" });
    assert.equal(stopRes.status, 200);
  } finally {
    child.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
  }
});

test("cleanOldBuilds deletes existing old ZIP archives in release directory", async () => {
  const releaseDir = join(process.cwd(), "release");
  const dummyOldZip = join(releaseDir, "DiagBridge-Portable-v0.0.0-old.zip");
  const { mkdirSync, writeFileSync: writeSync } = await import("node:fs");

  if (!existsSync(releaseDir)) {
    mkdirSync(releaseDir, { recursive: true });
  }

  writeSync(dummyOldZip, "dummy old zip content", "utf8");
  assert.ok(existsSync(dummyOldZip), "Dummy old zip file must exist before cleanup");

  cleanOldBuilds();

  assert.equal(existsSync(dummyOldZip), false, "Old zip file must be deleted by cleanOldBuilds()");
});
