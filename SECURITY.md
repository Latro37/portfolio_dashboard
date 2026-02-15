# Security Policy

## Reporting a Vulnerability

If you believe you have found a security issue in this project, open a GitHub issue and include:

- a clear description of the vulnerability
- affected files, endpoints, or flows
- reproducible steps
- impact assessment
- suggested mitigation (if available)

Please do not include secrets, API keys, tokens, credentials, or private account data in your report.

## Scope Notes

This is a local-first application intended to run on your own machine. Security posture can change if users expose local services externally or store credentials insecurely.

The backend enforces loopback-only access and a strict browser Origin allowlist for sensitive operations. When using `python start.py`, the allowlist is configured to match the dashboard's localhost port.

## Response Expectations

Security reports are triaged on a best-effort basis. Fix timelines are not guaranteed.
