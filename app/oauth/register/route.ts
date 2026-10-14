import { NextResponse } from "next/server";
import { registerOAuthClient } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return error("invalid_client_metadata", 400);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return error("invalid_client_metadata", 400);
    const body = JSON.parse(raw) as { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown };
    if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") return error("invalid_client_metadata", 400);
    const client = await registerOAuthClient({ clientName: String(body.client_name || ""), redirectUris: body.redirect_uris });
    return NextResponse.json({ client_id: client.clientId, client_name: client.clientName, redirect_uris: client.redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return error("invalid_client_metadata", 400);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}
