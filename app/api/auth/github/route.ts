import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { runtimeEnv } from "@/lib/runtimeEnv";
import { isSecureRequest, safeNext } from "@/lib/cloudflarePrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientId = runtimeEnv("GITHUB_OAUTH_CLIENT_ID");
  if (!clientId) return NextResponse.json({ error: "GitHub sign-in is not configured." }, { status: 503 });
  const url = new URL(request.url);
  const state = randomBytes(24).toString("base64url");
  const callback = `${url.origin}/api/auth/callback/github`;
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("scope", "read:user user:email");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  const secure = isSecureRequest(request) ? "; Secure" : "";
  response.headers.append("Set-Cookie", `gr_oauth_state=${encodeURIComponent(state)}; Max-Age=600; Path=/; HttpOnly;${secure} SameSite=Lax`);
  response.headers.append("Set-Cookie", `gr_oauth_next=${encodeURIComponent(safeNext(url.searchParams.get("next")))}; Max-Age=600; Path=/; HttpOnly;${secure} SameSite=Lax`);
  return response;
}
