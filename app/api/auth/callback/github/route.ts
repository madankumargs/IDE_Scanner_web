import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createSession,
  isSecureRequest,
  parseCookies,
  safeNext,
  sessionCookie,
  upsertGithubUser,
} from "@/lib/cloudflarePrivate";
import { runtimeEnv } from "@/lib/runtimeEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GithubUser = { id?: unknown; login?: unknown; name?: unknown; email?: unknown };
type GithubEmail = { email?: unknown; primary?: unknown; verified?: unknown };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const state = url.searchParams.get("state") || "";
  const expectedState = cookies.gr_oauth_state || "";
  const next = safeNext(cookies.gr_oauth_next);
  if (!state || !expectedState || !timingSafe(state, expectedState)) return redirectError(url, "invalid_state");
  const code = url.searchParams.get("code") || "";
  if (!code) return redirectError(url, "missing_code");
  const clientId = runtimeEnv("GITHUB_OAUTH_CLIENT_ID");
  const clientSecret = runtimeEnv("GITHUB_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return redirectError(url, "provider_unavailable");

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `${url.origin}/api/auth/callback/github`, state }),
    });
    const tokenBody = await tokenResponse.json() as { access_token?: unknown };
    const accessToken = typeof tokenBody.access_token === "string" ? tokenBody.access_token : "";
    if (!tokenResponse.ok || !accessToken) return redirectError(url, "provider_denied");
    const profileResponse = await githubFetch("https://api.github.com/user", accessToken);
    if (!profileResponse.ok) return redirectError(url, "provider_denied");
    const profile = await profileResponse.json() as GithubUser;
    const subject = String(profile.id || "").trim();
    if (!subject) return redirectError(url, "missing_identity");
    let email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    if (!email) {
      const emails = await githubFetch("https://api.github.com/user/emails", accessToken);
      if (emails.ok) {
        const values = await emails.json() as GithubEmail[];
        const preferred = values.find((item) => item.primary && item.verified) || values.find((item) => item.verified) || values[0];
        email = typeof preferred?.email === "string" ? preferred.email.trim().toLowerCase() : "";
      }
    }
    if (!email) return redirectError(url, "missing_email");
    const displayName = String(profile.name || profile.login || email.split("@")[0]).trim().slice(0, 120);
    const user = await upsertGithubUser({ subject, email, displayName });
    const session = await createSession(user.id);
    const response = NextResponse.redirect(new URL(next, url.origin));
    const secure = isSecureRequest(request);
    const clearFlag = secure ? "; Secure" : "";
    response.headers.append("Set-Cookie", sessionCookie(session, undefined, secure));
    response.headers.append("Set-Cookie", `gr_oauth_state=; Max-Age=0; Path=/; HttpOnly;${clearFlag} SameSite=Lax`);
    response.headers.append("Set-Cookie", `gr_oauth_next=; Max-Age=0; Path=/; HttpOnly;${clearFlag} SameSite=Lax`);
    return response;
  } catch {
    return redirectError(url, "provider_unavailable");
  }
}
async function githubFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "GuardRails/1.0" },
  });
}

function timingSafe(left: string, right: string): boolean {
  return createHash("sha256").update(left).digest("hex") === createHash("sha256").update(right).digest("hex");
}

function redirectError(url: URL, code: string): NextResponse {
  const destination = new URL("/account", url.origin);
  destination.searchParams.set("error", code);
  return NextResponse.redirect(destination);
}
