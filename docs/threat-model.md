# Threat Model

DiagBridge MCP has a narrow threat model. It is a visible local Windows MCP bridge for trusted sessions, not a sandbox or enterprise security product.

## Assumptions

- The user intentionally starts the bridge.
- The session is visible to the user.
- The MCP host provides approval prompts and tool policy.
- The bridge binds to `127.0.0.1` by default.
- Protected requests require a session token.
- `write_file` and `run_command` are disabled by default.
- Remote Streamable HTTP transport only exposes 4 read-only diagnostic tools.

## Main Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Unwanted local access | Session token required for protected remote endpoints. |
| Bridge left running | Visible console process and standard process management. |
| Host approves too much automation | Host policy is responsible; DiagBridge labels tools honestly. |
| Accidental destructive tool use | `write_file` and `run_command` disabled by default and marked destructive. |
| Command execution misuse | `run_command` is marked destructive + open-world and is never exposed by the remote transport. |
| Over-broad inventory scans | `drive_inventory` has maxDepth, maxEntries, maxSeconds, hidden-file handling, and default excludes. |
| Misread junk results | `junk_candidates` returns review-only candidates and does not delete, move, or clean. |
| Event-log privacy | `windows_event_summary` returns bounded snippets, not full unbounded event messages. |
| Audit blind spots | Basic JSONL audit records tool, parameter summary, time, and status. |

## Out of Scope

DiagBridge does not attempt to solve:

- Full command safety analysis.
- Sandboxing arbitrary commands.
- Enterprise RMM policy.
- Malware containment.
- Host compromise.
- Tamper-proof logging.
- Preventing a fully trusted local user from enabling powerful tools.
- Privilege elevation or bypassing Windows security boundaries.

## Project Red Lines

DiagBridge should not add:

- Hidden run mode.
- UAC bypass.
- Silent persistence.
- Credential-harvesting-specific tools.
- Disguised system service behavior.
- Approval-bypass behavior.
- Anti-security or anti-detection behavior.
