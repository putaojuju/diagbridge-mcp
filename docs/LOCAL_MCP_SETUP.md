# Local MCP Setup (stdio)

DiagBridge MCP provides a stdio transport for trusted local AI agents and MCP hosts such as Codex, Claude Code, Cursor, and similar tools.

> **Runtime Requirements**:
> Requires Node.js 22.6 or newer.
> Tested on Node.js 24.

## 1. Quick Start

### Build / Type Check

```bash
npm install
npm run check
npm test
```

### Manual Process Launch for Development

```bash
npm run dev:mcp
```

> [!NOTE]
> `npm run dev:mcp` is for manual process launch for development only. Do not use `npm` in MCP host configurations because `npm` output may contaminate JSON-RPC stdout protocol traffic.


## 2. MCP Host Configuration (Codex / Claude Code / Cursor)

MCP Hosts **must** invoke `node` directly with the absolute path to `stdio.ts`:

Example configuration:

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

### Windows PowerShell

```powershell
$env:DIAGBRIDGE_MCP_TOOLS = "system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file,run_command"
node --experimental-strip-types E:\diagbridge-mcp\src\mcp\transports\stdio.ts
```

### Linux / macOS Bash

```bash
DIAGBRIDGE_MCP_TOOLS=system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file,run_command node --experimental-strip-types ./src/mcp/transports/stdio.ts
```

> [!WARNING]
> `run_command` allows arbitrary local command execution with the privileges of the running process. Only enable it in trusted environments where the MCP host approval policy is configured.
