# Usage

DiagBridge MCP is intended for trusted, visible local sessions.

## Start read-only

```bash
npm install
npm run dev
```

By default DiagBridge listens on `127.0.0.1:8787` and enables only:

- `system_info`
- `list_dir`
- `read_file`

The server prints a session token at startup. Protected endpoints require that token.

## Enable write or command tools

Use `DIAGBRIDGE_TOOLS` to opt in:

```bash
DIAGBRIDGE_TOOLS=system_info,list_dir,read_file,write_file npm run dev
```

```bash
DIAGBRIDGE_TOOLS=system_info,list_dir,read_file,write_file,run_command npm run dev
```

`run_command` is destructive and open-world. Enable it only when the MCP host approval policy is configured for the session.

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

## Disconnect

```bash
curl -X POST -H "Authorization: Bearer <token>" http://127.0.0.1:8787/disconnect
```

After disconnect, protected requests are rejected.

## Audit log

Audit events are written as JSONL. Each event records:

- tool name
- summarized parameters
- timestamp
- result status
- optional message

The audit log is for visibility and troubleshooting. It is not tamper-proof storage.
