import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AuditLog } from "./audit.ts";
import { HTTP_CONNECTOR_TOOL_NAMES, loadHttpMcpConfig } from "./config.ts";
import { createSession, isRequestAuthorized } from "./session.ts";
import { handleMcpRequest, type JsonRpcRequest } from "./mcp-core.ts";

const config = loadHttpMcpConfig();
const session = createSession(config.sessionToken);
const audit = new AuditLog(config.auditLogPath);

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-diagbridge-session-token",
    "access-control-max-age": "86400",
  };
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8", ...corsHeaders() });
  res.end(body);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolvePromise(body ? JSON.parse(body) as unknown : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isMcpPath(url: string | undefined): boolean {
  return url === "/mcp" || Boolean(url?.startsWith("/mcp/"));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      sendText(res, 200, "DiagBridge MCP development HTTP connector server\n");
      return;
    }

    if (req.method === "OPTIONS" && isMcpPath(req.url)) {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/mcp") {
      if (!isRequestAuthorized(req.headers, session)) {
        sendJson(res, 401, { error: "missing or invalid session token" });
        return;
      }

      const body = await readJson(req);
      const requests = Array.isArray(body) ? body as JsonRpcRequest[] : [body as JsonRpcRequest];
      const responses = [];
      for (const request of requests) {
        const response = await handleMcpRequest(request, config, audit, HTTP_CONNECTOR_TOOL_NAMES);
        if (response) {
          responses.push(response);
        }
      }
      sendJson(res, 200, Array.isArray(body) ? responses : responses[0] ?? {});
      return;
    }

    sendText(res, 404, "not found\n");
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "unknown error" });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`DiagBridge development HTTP MCP endpoint listening on http://${config.host}:${config.port}/mcp`);
  console.log(`Session token: ${session.token}`);
  console.log(`HTTP connector tools: ${HTTP_CONNECTOR_TOOL_NAMES.join(", ")}`);
  console.log("Do not expose write_file or run_command over a public tunnel.");
});
