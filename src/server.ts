import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AuditLog } from "./audit.ts";
import { isToolName, loadConfig, type ToolName } from "./config.ts";
import { createSession, disconnectSession, isRequestAuthorized } from "./session.ts";
import { getToolMetadata, invokeTool } from "./tools/index.ts";

const config = loadConfig();
const session = createSession(config.sessionToken);
const audit = new AuditLog(config.auditLogPath);

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolvePromise(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function requireSession(req: IncomingMessage, res: ServerResponse): boolean {
  if (isRequestAuthorized(req.headers, session)) {
    return true;
  }

  sendJson(res, 401, {
    ok: false,
    error: "missing or invalid session token",
  });
  return false;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "diagbridge-mcp",
        bridge: "visible-windows-mcp-bridge",
        host: config.host,
        port: config.port,
        connected: session.connected,
        visible: session.visible,
        defaultAdmin: false,
        hiddenMode: false,
        uacBypass: false,
        enabledTools: config.enabledTools,
      });
      return;
    }

    if (!requireSession(req, res)) {
      return;
    }

    if (req.method === "POST" && req.url === "/disconnect") {
      disconnectSession(session);
      await audit.record({ toolName: "disconnect", params: {}, status: "ok" });
      sendJson(res, 200, { ok: true, connected: session.connected, disconnectedAt: session.disconnectedAt });
      return;
    }

    if (req.method === "GET" && req.url === "/tools") {
      sendJson(res, 200, { tools: getToolMetadata(config.enabledTools) });
      return;
    }

    if (req.method === "POST" && req.url === "/call") {
      const body = await readJson(req);
      const name = String(body.name ?? "");
      const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args as Record<string, unknown> : {};

      if (!isToolName(name)) {
        await audit.record({ toolName: name || "unknown", params: args, status: "denied", message: "unknown tool" });
        sendJson(res, 404, { ok: false, error: "unknown tool" });
        return;
      }

      if (!config.enabledTools.includes(name as ToolName)) {
        await audit.record({ toolName: name, params: args, status: "denied", message: "tool disabled" });
        sendJson(res, 403, { ok: false, error: "tool disabled by DiagBridge config" });
        return;
      }

      try {
        const result = await invokeTool(name as ToolName, args, config);
        await audit.record({ toolName: name, params: args, status: "ok" });
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        await audit.record({ toolName: name, params: args, status: "error", message });
        sendJson(res, 500, { ok: false, error: message });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : "unknown error" });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`DiagBridge MCP visible bridge listening on http://${config.host}:${config.port}`);
  console.log(`Session token: ${session.token}`);
  console.log("Default tools are read-only. Enable write_file/run_command only for trusted sessions and host approval policies.");
});
