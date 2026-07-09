# Threat Model

DiagBridge is designed for trusted human collaboration, but it must assume AI agents, helpers, network peers, and prompts can make unsafe requests.

## Assets to protect

- The diagnosed user's consent and control.
- Personal files and private logs.
- Credentials, browser data, tokens, SSH keys, API keys, wallets, and cookies.
- System integrity and availability.
- Audit logs and approval records.
- The reputation of the project as a transparent diagnostic tool rather than a remote-control backdoor.

## Primary actors

| Actor | Role | Trust level |
| --- | --- | --- |
| Diagnosed user | Permission owner using the affected PC | Highest local authority |
| Helper | Friend or technician helping the user | Trusted but bounded |
| AI agent | Temporary diagnostic guest | Untrusted until constrained by policy |
| Gateway operator | Hosts gateway infrastructure | Privileged service role |
| Malicious prompt/source | Attempts to steer the AI into unsafe actions | Untrusted |
| Local malware | May try to abuse the agent if present | Hostile |

## Abuse cases

### AI asks for a raw shell

A malicious or confused AI may request `run_powershell(command)`, `cmd.exe`, encoded scripts, WMI command execution, or registry edits.

Mitigation: no default raw shell tool exists. Unknown shell-like tool names are denied by policy. Any future expert mode must be disabled by default and policy-gated.

### User is tricked into approving opaque code

A normal user cannot reasonably evaluate arbitrary PowerShell.

Mitigation: approval is not the primary safety boundary. The policy engine must block dangerous actions before the user sees an approval button. Approval text must explain human-level impact, not code.

### Credential collection disguised as diagnostics

Requests may target browser profiles, SSH directories, token files, password stores, cookie databases, wallet files, or cloud credentials.

Mitigation: sensitive path and content patterns are Red and denied by default. Redaction is applied to diagnostic output.

### Silent or persistent remote control

An attacker may try to make the agent invisible or persistent.

Mitigation: hidden mode and stealth persistence are non-goals and rejected features. The Windows Agent must remain visible and revocable.

### Overbroad file access

A tool may try to read arbitrary paths such as the full user profile or application data.

Mitigation: file reads require allowed roots, size limits, risk classification, and redaction.

### Session confusion

One helper or AI session may accidentally act on another user's computer.

Mitigation: gateway and agent must track session IDs, diagnosed-user presence, device labels, and consent state.

### Gateway compromise

A compromised gateway could try to forward unsafe operations.

Mitigation: the Windows Agent should also enforce local policy and never expose a raw command channel. Defense in depth is required in later phases.

## Out of scope for phase 1

- Real remote command execution.
- System repair operations.
- Administrator elevation.
- Registry modification.
- Service installation.
- Browser profile inspection.
- Credential discovery.
- Permanent unattended remote access.

## Security invariants

- No hidden run mode.
- No default admin.
- No raw shell.
- No credential reads.
- No execution without policy approval.
- No approval prompt that shifts script-understanding responsibility to ordinary users.
