# MCP Tool Policy

DiagBridge exposes structured diagnostic tools rather than arbitrary command execution.

## Tool policy goals

- Make every tool understandable by name, schema, and risk level.
- Keep Green tools read-only.
- Treat privacy-touching reads as Blue.
- Treat repairs as Yellow or higher.
- Treat system changes as Orange.
- Treat credential access, hidden control, and raw shell execution as Red.
- Compute risk from Action Registry and Policy Engine, not from AI-provided arguments.

## Phase 1 tool surface

| Tool | Default risk | Phase 1 status | Notes |
| --- | --- | --- | --- |
| `get_system_overview` | Green | Mock | Basic OS/device summary only |
| `run_network_diagnosis` | Green | Mock | No packet capture or credential reads |
| `list_allowed_roots` | Green | Mock | Shows scoped roots only |
| `read_text_file` | Blue | Mock | Must be allowed-root bounded and redacted later |
| `search_logs` | Blue | Mock | Must have size limits and redaction later |
| `explain_pending_action` | Green | Mock | Converts action to plain language |
| `request_action_approval` | Computed from action | Mock | Accepts `actionType` and `params`; does not trust AI-supplied `risk` |
| `execute_approved_action` | Computed from action | Mock | Requires an `ApprovalRecord`; never treats an ID prefix as execution authority |
| `collect_diagnostic_report` | Blue | Mock | Bundle metadata only in phase 1 |

## Action-based approval

Approval requests are structured around actions:

```json
{
  "actionType": "flush_dns_cache",
  "params": {},
  "diagnosticIntent": "Try a low-risk network repair after read-only diagnosis"
}
```

The AI may provide diagnostic intent, action type, and parameters. It may not provide the final risk as an authority.

Policy Engine and Action Registry decide:

- Risk level.
- Approval kind.
- Reversibility.
- Scope.
- Whether the action is blocked.
- Whether the action can become an approval prompt.

## Forbidden default tools

The following must not exist as normal MCP tools:

- `run_powershell(command)`
- `run_cmd(command)`
- `execute_script(script)`
- `download_and_execute(url)`
- `read_browser_passwords`
- `read_cookies`
- `read_ssh_keys`
- `read_api_keys`
- `read_wallet_files`

Shell-like names should be treated as suspicious even if not explicitly listed.

## Policy decision contract

Each tool call should return or log a policy decision with:

- `allowed`
- `risk`
- `requiresApproval`
- `approvalKind`
- `reasons`
- `redactions`
- `mockOnly`
- `actionType`
- `actionHash`
- `scope`

Deny decisions should be explicit and explainable.

## Red request examples

Requests are Red if they involve:

- Credential stores.
- Browser password databases.
- Cookies or session tokens.
- SSH private keys.
- API keys or `.env` secrets.
- Cryptocurrency wallet files.
- Encoded or downloaded scripts.
- UAC bypass.
- Security tool disablement.
- Hidden persistence.
- Remote script execution.
- Opaque commands that cannot be explained to the diagnosed user.

Red requests must be blocked by policy. They must not be converted into normal user approval prompts.

## Expert mode reservation

If future expert mode is introduced, it must be:

- Disabled by default.
- Clearly labeled as expert mode.
- Hidden behind a policy engine.
- Audited.
- Reversible where possible.
- Blocked from credential access.
- Blocked from silent persistence.

Expert mode must not be the normal path for diagnostics.
