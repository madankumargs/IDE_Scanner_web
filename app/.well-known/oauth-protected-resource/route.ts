import { NextResponse } from "next/server";
import { MCP_RESOURCE, MCP_SCOPES } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";

export function GET() {
  return metadataResponse();
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function metadataResponse() {
  return NextResponse.json({ resource: MCP_RESOURCE, authorization_servers: ["https://abscissa.dev"], scopes_supported: MCP_SCOPES, bearer_methods_supported: ["header"] }, { headers: corsHeaders() });
}

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "public, max-age=300" };
}
