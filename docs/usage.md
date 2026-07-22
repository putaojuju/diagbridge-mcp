# Usage Guide

DiagBridge MCP is a general Windows MCP bridge for trusted local and remote AI agents.

## Install and Verify

```bash
npm install
npm run check
npm test
```

## Start Stdio MCP Server (Local Clients)

```bash
npm run dev:mcp
```

This runs the stdio MCP server for local MCP clients like Codex, Claude Code, or Cursor.

Default enabled local tools:

- `system_info`
- `list_dir`
- `read_file`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

## Start Streamable HTTP Server (Remote Clients)

```bash
npm run dev:remote-mcp
```

This starts the Streamable HTTP MCP transport at:

```text
http://127.0.0.1:8787/mcp
```

It exposes only 4 read-only diagnostic tools:

- `system_info`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

`read_file`, `write_file`, and `run_command` are **never** exposed over Streamable HTTP.

## Enable Write or Command Tools for Local Stdio Only

Use `DIAGBRIDGE_MCP_TOOLS` to opt in for the local stdio MCP server:

```bash
DIAGBRIDGE_MCP_TOOLS=system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file npm run dev:mcp
```

```bash
DIAGBRIDGE_MCP_TOOLS=system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file,run_command npm run dev:mcp
```

`run_command` is destructive and open-world. Never attempt to expose it to remote clients.

## Audit Log

Audit events are written as JSONL (`.diagbridge-audit.jsonl`). Each event records:

- tool name
- summarized parameters
- timestamp
- result status
- optional error message
