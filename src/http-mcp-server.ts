import { createServer, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuditLog } from "./audit.ts";
import { HTTP_CONNECTOR_TOOL_NAMES, loadHttpMcpConfig } from "./config.ts";
import { createDiagBridgeMcpServer } from "./mcp-server-factory.ts";
import { createSession, isHttpConnectorRequestAuthorized } from "./session.ts";

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, accept, authorization, x-diagbridge-session-token, mcp-session-id, last-event-id, mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id",
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

function isMcpPath(url: string | undefined): boolean {
  return url === "/mcp" || Boolean(url?.startsWith("/mcp/"));
}

async function main(): Promise<void> {
  const config = loadHttpMcpConfig();
  const session = createSession(config.sessionToken);
  const audit = new AuditLog(config.auditLogPath);

  const httpServer = createServer(async (req, res) => {
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
        if (!isHttpConnectorRequestAuthorized(req.headers, session, config.httpDevNoAuth)) {
          sendJson(res, 401, { error: "missing or invalid session token" });
          return;
        }

        for (const [name, value] of Object.entries(corsHeaders())) {
          res.setHeader(name, value);
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const mcpServer = createDiagBridgeMcpServer(config, audit, HTTP_CONNECTOR_TOOL_NAMES);

        try {
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res);
        } catch (error) {
          console.error("Error handling MCP request:", error);
          if (!res.headersSent) {
            sendJson(res, 500, {
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal server error",
              },
              id: null,
            });
          }
        } finally {
          res.once("close", () => {
            void transport.close();
            void mcpServer.close();
          });
        }
        return;
      }

      if ((req.method === "GET" || req.method === "DELETE") && req.url === "/mcp") {
        sendJson(res, 405, {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed in stateless development mode.",
          },
          id: null,
        });
        return;
      }

      sendText(res, 404, "not found\n");
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "unknown error" });
      }
    }
  });

  httpServer.listen(config.port, config.host, () => {
    console.log(`DiagBridge official Streamable HTTP MCP endpoint listening on http://${config.host}:${config.port}/mcp`);
    console.log(`HTTP connector tools: ${HTTP_CONNECTOR_TOOL_NAMES.join(", ")}`);

    if (config.httpDevNoAuth) {
      console.warn("WARNING: DIAGBRIDGE_HTTP_DEV_NO_AUTH=1 is enabled.");
      console.warn("Use this only for short-lived localhost Inspector testing. Do not leave it on or expose it through a public tunnel.");
    } else {
      console.log(`Session token: ${session.token}`);
    }

    console.log("write_file and run_command are never registered on the HTTP connector transport.");
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
