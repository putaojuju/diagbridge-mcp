const gatewayUrl = process.env.DIAGBRIDGE_GATEWAY_URL ?? "http://127.0.0.1:8787";

type JsonObject = Record<string, unknown>;

async function gatewayGet(path: string): Promise<unknown> {
  const response = await fetch(`${gatewayUrl}${path}`);
  return response.json();
}

async function gatewayCallTool(name: string, args: JsonObject): Promise<unknown> {
  const response = await fetch(`${gatewayUrl}/mcp/tools/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, args }),
  });
  return response.json();
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "list-tools";

  if (command === "health") {
    console.log(JSON.stringify(await gatewayGet("/health"), null, 2));
    return;
  }

  if (command === "call") {
    const toolName = process.argv[3];
    const rawArgs = process.argv[4] ?? "{}";
    if (!toolName) {
      throw new Error("Usage: npm run dev:mcp-local -- call <toolName> '{\"key\":\"value\"}'");
    }
    console.log(JSON.stringify(await gatewayCallTool(toolName, JSON.parse(rawArgs) as JsonObject), null, 2));
    return;
  }

  console.log(JSON.stringify(await gatewayGet("/mcp/tools/list"), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
