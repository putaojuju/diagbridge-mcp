# Usage

DiagBridge MCP is intended for trusted, visible local sessions.

## Install and check

```bash
npm install
npm run check
npm test
```

## Start local HTTP bridge

```bash
npm run dev
```

By default DiagBridge listens on `127.0.0.1:8787` and enables read-only local tools:

- `system_info`
- `list_dir`
- `read_file`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

The server prints a session token at startup. Protected endpoints require that token.

## Start stdio MCP server

```bash
npm run dev:mcp
```

Use this for local MCP hosts that spawn a stdio server.

## Start development HTTP MCP fallback

```bash
npm run dev:http-mcp
```

This starts a development-only HTTP MCP endpoint at:

```text
http://127.0.0.1:8787/mcp
```

It exposes only:

- `system_info`
- `drive_inventory`
- `junk_candidates`
- `windows_event_summary`

It does not expose `read_file`, `write_file`, or `run_command` to the HTTP connector by default.

## Windows event summary count semantics

`windows_event_summary.summary` contains event-record counts:

```text
applicationCrashEvents
unexpectedShutdownEvents
hardwareErrorEvents
diskErrorEvents
countMeaning = "event_records_not_unique_incidents"
```

The tool does not deduplicate related records into unique incidents. A single application crash may produce both an `Application Error` 1000 event and a `Windows Error Reporting` 1001 event, and both records may be counted.

## Enable write or command tools for local development only

Use `DIAGBRIDGE_TOOLS` to opt in for the local bridge or stdio MCP server:

```bash
DIAGBRIDGE_TOOLS=system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file npm run dev
```

```bash
DIAGBRIDGE_TOOLS=system_info,list_dir,read_file,drive_inventory,junk_candidates,windows_event_summary,write_file,run_command npm run dev
```

`run_command` is destructive and open-world. Do not expose it through a public tunnel.

## Call a tool through the local bridge

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8787/tools
```

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"system_info","args":{}}' \
  http://127.0.0.1:8787/call
```

## Call a tool through `/mcp`

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:8787/mcp
```

## Disconnect local bridge

```bash
curl -X POST -H "Authorization: Bearer <token>" http://127.0.0.1:8787/disconnect
```

After disconnect, protected local bridge requests are rejected.

## Audit log

Audit events are written as JSONL. Each event records:

- tool name
- summarized parameters
- timestamp
- result status
- optional message

The audit log is for visibility and troubleshooting. It is not tamper-proof storage.
