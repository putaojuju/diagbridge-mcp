# DiagBridge MCP Tool Documentation

DiagBridge MCP exposes a single, unified Tool Registry (`src/mcp/tool-registry.ts`). Each tool is defined once with its metadata, Zod schema, annotations, and handler.

## Available Tools Summary

| Tool Name | Title | Annotations | stdio Availability | Streamable HTTP Availability |
| --- | --- | --- | --- | --- |
| `system_info` | System Information | Read-Only | Enabled (default) | Enabled (default) |
| `drive_inventory` | Drive Inventory | Read-Only | Enabled (default) | Enabled (default) |
| `junk_candidates` | Junk Candidates | Read-Only | Enabled (default) | Enabled (default) |
| `windows_event_summary` | Windows Event Summary | Read-Only | Enabled (default) | Enabled (default) |
| `list_dir` | List Directory | Read-Only | Enabled (default) | Excluded |
| `read_file` | Read File | Read-Only | Enabled (default) | Excluded |
| `write_file` | Write File | Destructive | Opt-in only | Excluded |
| `run_command` | Run Command | Destructive + Open-World | Opt-in only | Excluded |

## Detailed Tool Descriptions

### 1. `system_info`
- **Description**: Returns basic local OS metadata (hostname, OS type, platform, release, architecture, uptime, memory, username).
- **Safety**: Read-only, safe for remote and local access.

### 2. `drive_inventory`
- **Description**: Scans directory tree metadata (name, path, type, size, mtime, extension) without reading file contents.
- **Bounds**: Enforces `maxDepth` (0–10), `maxEntries` (1–100,000), `maxSeconds` (1–300), and excludes sensitive system folders by default.

### 3. `junk_candidates`
- **Description**: Identifies temporary files, crash dumps, old logs, and empty directories.
- **Safety**: Purely read-only analysis. Returns `recommendedAction: "review_only"`. Does **not** delete or modify files.

### 4. `windows_event_summary`
- **Description**: Queries recent Windows Application/System event logs using a fixed, hardcoded PowerShell query.
- **Safety**: Does not accept arbitrary commands. Bounded event count and message snippet size.

### 5. `list_dir`
- **Description**: Lists files and directories in a local path.
- **Safety**: Read-only directory listing for local agents.

### 6. `read_file`
- **Description**: Reads content from a local file up to `maxBytes` (default 1MB, max 16MB).
- **Safety**: Read-only file access.

### 7. `write_file`
- **Description**: Writes text content to a specified path.
- **Safety**: Destructive. Disabled by default. Only available on stdio when explicitly enabled.

### 8. `run_command`
- **Description**: Executes a command with specified arguments in the local environment.
- **Safety**: Destructive and open-world capability. Disabled by default. Never available over remote HTTP transport.
