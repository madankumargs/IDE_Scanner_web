# GuardRails MCP plugin

This package is the submission artifact for the public GuardRails MCP server.
It connects AI assistants to read-only public intelligence about published IDE
extensions.

## Capabilities

- Check the public analysis verdict for an exact extension release.
- Find reputable analyzed alternatives by category or keyword.
- Link every result to a public evidence report.

The server does not install extensions, modify a workspace, or access private
workspace data. An `unreviewed` result is unknown, never approval.

## Endpoint

`https://abscissa.dev/api/mcp`

## Directory submission

1. Complete individual or business verification for the GuardRails publisher.
2. Upload this directory as a ZIP in the OpenAI Plugins portal using **With MCP**.
3. Select the `guardrails` remote server and allow the portal to scan its tools.
4. Resolve any scan findings, submit for review, and publish after approval.

The directory listing uses the public support, privacy, and terms URLs in the
manifest. Keep the MCP endpoint and tool schemas backward-compatible after
publication; rescan the endpoint in the portal after changes.

## Test prompts

- Check `ms-python.python` version `2026.7.2026092501` before I install it.
- Is this extension safe to recommend? Check `publisher.name` first.
- Find reputable alternatives for a Python linter.
