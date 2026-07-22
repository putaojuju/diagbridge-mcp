# Local MCP Setup (stdio)

DiagBridge MCP provides a stdio transport for trusted local AI agents and MCP hosts such as Codex, Claude Code, Cursor, and similar tools.

## 1. Quick Start

### Build / Type Check

```bash
npm install
npm run check
npm test
```

### Run Stdio MCP Server

```bash
npm run dev:mcp
```

Or invoke directly with Node:

```bash
node --experimental-strip-types src/mcp/transports/stdio.ts
```

## 2. Supported Local MCP Hosts

### Codex / Claude Code / Cursor

Configure the MCP client settings to launch DiagBridge as a stdio server process.

Example `claude_desktop_config.json` / Cursor MCP config:

```json
{
  "mcpServers": {
    "diagbridge": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "E:/diagbridge-mcp/src/mcp/transports/stdio.ts"
      ]
    }
  }
}
```

## 3. Default Local Tool Whitelist

By default, the local stdio transport enables 6 read-only diagnostic tools:

- `system_info`
- `list_dir`
- `read_file`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

`write_file` and `run_command` are **disabled by default**.

## 4. Enabling Destructive Tools for Local Development

To opt in to `write_file` or `run_command` in a trusted local session, set `DIAGBRIDGE_MCP_TOOLS`:

```bash
DIAGBRIDGE_MCP_TOOLS=system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file,run_command npm run dev:mcp
```

> [!WARNING]
> `run_command` allows arbitrary local command execution with the privileges of the running process. Only enable it in trusted environments where the MCP host approval policy is configured.
