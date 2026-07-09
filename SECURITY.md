# Security Policy

DiagBridge MCP is a visible local bridge, not a full security platform.

The MCP host is responsible for user-facing tool approval, automation level, and allow/deny policy. DiagBridge keeps a smaller responsibility: visible operation, temporary session token, disconnect state, audit logging, localhost default binding, and honest tool metadata.

## Red lines

The project does not accept features that add:

- Hidden run mode.
- UAC bypass.
- Silent persistence.
- Credential-collection-specific tools.
- Browser password or cookie harvesting helpers.
- SSH key, API key, token, or wallet harvesting helpers.
- System-service disguise or fake system component naming.
- Bypassing or suppressing the MCP host's approval mechanism.
- Anti-security-tool or anti-detection behavior.

## `run_command`

`run_command` is intentionally labeled destructive and open-world. It should be disabled by default and enabled only by a user who understands the MCP host's approval behavior.

DiagBridge does not claim that commands are safe. The host and user configuration decide whether the tool should be available.

## Reporting issues

Please report security issues through GitHub Security Advisories if available. For public issues, avoid posting exploit details that could harm users.
