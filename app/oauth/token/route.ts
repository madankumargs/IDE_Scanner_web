import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, MCP_RESOURCE } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.formData().catch(() => null);
  if (!body || String(body.get("grant_type") || "") !== "authorization_code") return oauthError("unsupported_grant_type");
  const token = await exchangeAuthorizationCode({
    code: String(body.get("code") || ""),
    clientId: String(body.get("client_id") || ""),
    redirectUri: String(body.get("redirect_uri") || ""),
    codeVerifier: String(body.get("code_verifier") || ""),
    resource: String(body.get("resource") || MCP_RESOURCE),
  }).catch(() => null);
  if (!token) return oauthError("invalid_grant");
  return NextResponse.json({ access_token: token.accessToken, token_type: "Bearer", expires_in: token.expiresIn, scope: token.scope }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

function oauthError(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}
