import { NextResponse } from "next/server";
import { MCP_SCOPES } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    issuer: "https://abscissa.dev",
    authorization_endpoint: "https://abscissa.dev/oauth/authorize",
    token_endpoint: "https://abscissa.dev/oauth/token",
    registration_endpoint: "https://abscissa.dev/oauth/register",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: MCP_SCOPES,
    service_documentation: "https://abscissa.dev/docs/mcp",
  }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
}
