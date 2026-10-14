import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, exchangeRefreshToken, MCP_RESOURCE } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.formData().catch(() => null);
  if (!body) return oauthError("invalid_request");
  const grantType = String(body.get("grant_type") || "");
  const clientId = String(body.get("client_id") || "");
  const resource = String(body.get("resource") || MCP_RESOURCE);
  const token = grantType === "authorization_code"
    ? await exchangeAuthorizationCode({ code: String(body.get("code") || ""), clientId, redirectUri: String(body.get("redirect_uri") || ""), codeVerifier: String(body.get("code_verifier") || ""), resource }).catch(() => null)
    : grantType === "refresh_token"
      ? await exchangeRefreshToken({ refreshToken: String(body.get("refresh_token") || ""), clientId, resource }).catch(() => null)
      : null;
  if (!token && !["authorization_code", "refresh_token"].includes(grantType)) return oauthError("unsupported_grant_type");
  if (!token) return oauthError("invalid_grant");
  return NextResponse.json({ access_token: token.accessToken, refresh_token: token.refreshToken, token_type: "Bearer", expires_in: token.expiresIn, scope: token.scope }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

function oauthError(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}
