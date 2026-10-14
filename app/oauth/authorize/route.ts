import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { parseCookies, requestIsSecure, userFromSession } from "@/lib/cloudflarePrivate";
import { issueAuthorizationCode, parseAuthorizationRequest, userHasMcpWorkspaceAccess } from "@/lib/mcpOAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = await parseAuthorizationRequest(url).catch(() => null);
  if (!parsed) return new NextResponse("Invalid OAuth authorization request.", { status: 400, headers: { "Cache-Control": "no-store" } });
  const user = await userFromSession(request).catch(() => null);
  if (!user) return NextResponse.redirect(new URL(`/account?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`, url.origin));
  const csrf = randomBytes(24).toString("base64url");
  const response = new NextResponse(consentPage({ clientName: parsed.client.clientName, clientId: parsed.request.clientId, redirectUri: parsed.request.redirectUri, scope: parsed.request.scope, state: parsed.request.state, resource: parsed.request.resource, codeChallenge: parsed.request.codeChallenge, csrf }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
  response.headers.append("Set-Cookie", csrfCookie(csrf, requestIsSecure(request)));
  return response;
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return new NextResponse("Invalid authorization request.", { status: 400 });
  const user = await userFromSession(request).catch(() => null);
  const params = new URLSearchParams();
  for (const key of ["client_id", "redirect_uri", "scope", "state", "resource", "code_challenge"] as const) params.set(key, String(form.get(key) || ""));
  params.set("response_type", "code");
  params.set("code_challenge_method", "S256");
  const parsed = await parseAuthorizationRequest(new URL(`/oauth/authorize?${params}`, request.url)).catch(() => null);
  if (!parsed || !user || !csrfMatches(request, String(form.get("csrf") || ""))) return new NextResponse("Invalid authorization request.", { status: 400, headers: { "Cache-Control": "no-store" } });
  if (form.get("decision") !== "approve") return redirectError(parsed.request.redirectUri, parsed.request.state, "access_denied");
  if (parsed.request.scope.includes("workspace:read") && !(await userHasMcpWorkspaceAccess(user.id))) return redirectError(parsed.request.redirectUri, parsed.request.state, "access_denied", "Create or join a GuardRails workspace before granting workspace access.");
  const code = await issueAuthorizationCode({ ...parsed.request, userId: user.id });
  const destination = new URL(parsed.request.redirectUri);
  destination.searchParams.set("code", code);
  if (parsed.request.state) destination.searchParams.set("state", parsed.request.state);
  const response = NextResponse.redirect(destination);
  response.headers.append("Set-Cookie", csrfCookie("", requestIsSecure(request), 0));
  return response;
}

function redirectError(redirectUri: string, state: string, error: string, description?: string) {
  const destination = new URL(redirectUri);
  destination.searchParams.set("error", error);
  if (description) destination.searchParams.set("error_description", description);
  if (state) destination.searchParams.set("state", state);
  return NextResponse.redirect(destination);
}

function csrfCookie(value: string, secure: boolean, maxAge = 600) {
  return `gr_mcp_oauth_csrf=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/oauth/authorize; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax`;
}

function csrfMatches(request: Request, value: string) {
  const expected = parseCookies(request.headers.get("cookie") || "").gr_mcp_oauth_csrf || "";
  return Boolean(value && expected) && createHash("sha256").update(value).digest("hex") === createHash("sha256").update(expected).digest("hex");
}

function consentPage(input: { clientName: string; clientId: string; redirectUri: string; scope: string[]; state: string; resource: string; codeChallenge: string; csrf: string }) {
  const hidden = Object.entries({ client_id: input.clientId, redirect_uri: input.redirectUri, scope: input.scope.join(" "), state: input.state, resource: input.resource, code_challenge: input.codeChallenge, csrf: input.csrf }).map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`).join("");
  const scopes = input.scope.map((scope) => `<li>${escape(scope === "workspace:read" ? "Read your GuardRails workspace inventory, evidence, monitoring, policies, decisions, and audit history." : "Read published GuardRails extension-package analysis and evidence.")}</li>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize GuardRails MCP</title><style>body{margin:0;background:#f7f7f2;color:#172018;font:16px system-ui,sans-serif}main{max-width:640px;margin:8vh auto;padding:32px}section{background:#fff;border:1px solid #d4d9d1;padding:28px;border-radius:8px}h1{margin:0 0 12px;font-size:28px}p,li{line-height:1.55;color:#455047}ul{padding-left:22px}button{font:inherit;font-weight:700;border-radius:6px;padding:10px 16px;margin-right:8px;cursor:pointer}button[name=decision]{background:#166534;color:#fff;border:1px solid #166534}button[value=deny]{background:#fff;color:#172018;border:1px solid #9ca89e}</style><main><section><p>GuardRails MCP authorization</p><h1>${escape(input.clientName)} wants read-only access</h1><p>This client will receive a short-lived token for the scopes below. GuardRails never grants write access through MCP.</p><ul>${scopes}</ul><form method="post">${hidden}<button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button></form></section></main></html>`;
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
