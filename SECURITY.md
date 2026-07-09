# Security Policy

DiagBridge is a remote diagnostics collaboration tool. Security and user consent are core product requirements, not optional features.

## Supported versions

The project is pre-release. Only the `main` branch is considered supported for security review until the first tagged release.

## Reporting a vulnerability

Please use GitHub Security Advisories when available. If public disclosure would expose users to risk, do not open a public issue with exploit details.

A useful report should include:

- Affected commit or version.
- Reproduction steps.
- Expected and actual behavior.
- Impact on consent, authorization, credential exposure, auditability, or command execution.
- Whether the issue can be triggered remotely or by an AI agent prompt.

## Security red lines

The project must not accept features that add:

- Hidden or stealth run modes.
- Persistence intended to survive user removal or hide from the user.
- Default administrator execution.
- UAC bypass, privilege escalation, or security-product bypass.
- A normal exposed `run_powershell(command)` or equivalent raw shell tool.
- Browser password, cookie, SSH key, API key, private key, wallet, token, or credential harvesting.
- Remote script execution without a policy decision and explicit diagnostic purpose.
- Approval prompts that ask non-technical users to approve opaque code.

## Security model summary

- The diagnosed user is the permission owner.
- AI agents are temporary guests.
- Tools are structured and risk-classified.
- The policy engine is the primary safety boundary.
- Approval is a consent signal, not a substitute for policy enforcement.
- High-risk and credential-related requests are denied by default.
- Every sensitive action should be auditable and revocable.

## Phase 1 limitations

The current code is intentionally mock-first. It does not run real Windows commands, edit the registry, collect credentials, or perform repairs.
