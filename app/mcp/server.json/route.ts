export const dynamic = "force-static";

const SERVER_CARD = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: "dev.abscissa/guardrails",
  title: "GuardRails",
  description: "Read-only VS Code extension-package evidence and authorized workspace intelligence.",
  version: "1.3.0",
  websiteUrl: "https://abscissa.dev/docs/mcp",
  repository: {
    url: "https://github.com/preethamak/IDE_Scanner_web",
    source: "github",
  },
  remotes: [{ type: "streamable-http", url: "https://abscissa.dev/api/mcp" }],
  _meta: {
    "io.modelcontextprotocol.registry/publisher-provided": {
      contactEmail: "hello@abscissa.dev",
      documentationUrl: "https://abscissa.dev/docs/mcp",
      categories: ["software_development", "security"],
    },
  },
};

export function GET() {
  return Response.json(SERVER_CARD, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
