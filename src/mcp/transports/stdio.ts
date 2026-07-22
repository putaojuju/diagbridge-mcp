import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuditLog } from "../../audit.ts";
import { loadConfig } from "../../config.ts";
import { createDiagBridgeMcpServer } from "../server-factory.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const audit = new AuditLog(config.auditLogPath);
  const server = createDiagBridgeMcpServer(config, audit, config.enabledTools);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
