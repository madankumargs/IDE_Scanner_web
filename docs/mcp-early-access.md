# GuardRails MCP early access

The read-only Streamable HTTP endpoint is `https://abscissa.dev/api/mcp`.
It exposes published extension intelligence anonymously and workspace
intelligence only after browser OAuth approval. It never runs scans, changes
workspace data, or grants access beyond the signed-in user’s memberships.

## Available tools

| Tool | Use it for |
| --- | --- |
| `check_extension_risk` | Verify a candidate extension, optionally pinning the exact version. |
| `find_reputable_alternatives` | Find up to five analyzed alternatives when a candidate needs review or is blocked. |
| `search_vscode_extensions` | Resolve a marketplace query to an exact `publisher.name` identifier. |
| `get_extension_release` | Retrieve catalog and evidence for an exact published extension release. |
| `list_published_extension_scans` / `get_extension_scan_history` | Research published analysis coverage without treating absence as approval. |
| `get_guardrails_analysis_rules` / `get_guardrails_service_status` | Explain the active rules and confirm public service availability. |
| `list_guardrails_workspaces` | List workspaces available to the signed-in MCP user. |
| `get_workspace_extension_inventory` | Read observed extension inventory, versions, and monitoring state. |
| `get_workspace_monitoring` | Read watchlists, release events, alerts, and monitoring status. |
| `get_workspace_policies` | Read policy rules and monitoring preferences. |
| `get_workspace_decision_history` / `get_workspace_audit_history` | Read decision evidence and audit history. |

An `unreviewed` result is unknown, not approval. Every completed-result payload
includes an absolute URL to the corresponding public report.

## Authorization

Public evidence tools are available without a token. Workspace tools require
OAuth 2.1 authorization code flow with PKCE and the `workspace:read` scope. An
unauthorized workspace call receives HTTP 401 with protected-resource metadata
at `https://abscissa.dev/.well-known/oauth-protected-resource/api/mcp`.

The authorization server metadata is published at
`https://abscissa.dev/.well-known/oauth-authorization-server`. It supports
dynamic client registration, PKCE S256, authorization-code exchange, and
refresh-token rotation. Access tokens are short-lived and both access and
refresh tokens are stored only as hashes in D1.

`MCP_ACCESS_TOKEN` and `MCP_REQUIRE_AUTH` remain a legacy emergency guard for
the public endpoint. They must not be used to grant workspace access.

## Connect an assistant

Anonymous deployments:

```bash
codex mcp add guardrails --url https://abscissa.dev/api/mcp
claude mcp add --transport http guardrails https://abscissa.dev/api/mcp
```

OAuth workspace access:

```bash
codex mcp add guardrails --url https://abscissa.dev/api/mcp
codex mcp login guardrails
codex mcp get guardrails

claude mcp add --transport http guardrails https://abscissa.dev/api/mcp
# In Claude Code, select guardrails in /mcp and complete the browser sign-in.
claude mcp get guardrails
```

The user must sign in to GuardRails and belong to at least one workspace before
approving `workspace:read`. The consent screen states the requested read-only
scope; there is no write scope.

## Example workflows

Before recommending a developer extension, ask the assistant: “Use GuardRails
to check `publisher.name` version `1.2.3`; if it is not safe to recommend,
find reputable alternatives for its category.” The first tool establishes the
exact-artifact verdict, and the second only searches analyzed releases.

For an unpinned request, the MCP server returns the latest analyzed release.
Use the exact `version` parameter for install, CI, or procurement decisions.

For workspace review, ask: “List my GuardRails workspaces. For the selected
workspace, summarize monitored release events, unread alerts, extensions that
need review, the relevant policy, and prior decision rationale. Do not change
anything.”

## Reliability contract

- Stateless JSON-RPC 2.0 requests over HTTP POST; no server-sent event session.
- Supports `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`.
- Advertises MCP protocol `2025-06-18`, explicit input/output schemas, and read-only safety annotations.
- Request bodies are limited to 64 KiB. Oversized payloads receive HTTP 413.
- Tool errors remain MCP results with `isError: true`; unknown methods use standard JSON-RPC errors.
- Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- OAuth metadata is public and cacheable; OAuth token, authorization, and MCP
  workspace responses are `no-store`.
- Workspace tools enforce `workspace:read` at the HTTP boundary and confirm
  membership before retrieving workspace state.

Run the focused contract test before deployment:

```bash
npx vitest run lib/mcpOAuth.test.ts app/api/mcp/route.test.ts
```
