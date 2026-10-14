import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { nowIso, privateDb } from "@/lib/cloudflarePrivate";

export const MCP_RESOURCE = "https://abscissa.dev/api/mcp";
export const MCP_SCOPES = ["mcp:read", "workspace:read"] as const;
const CODE_TTL_MS = 5 * 60_000;
const TOKEN_TTL_MS = 60 * 60_000;

type OAuthClientRow = { client_id: string; client_name: string; redirect_uris_json: string };
type CodeRow = { client_id: string; user_id: string; redirect_uri: string; scope: string; resource: string; code_challenge: string; expires_at: string };
type TokenRow = { client_id: string; user_id: string; scope: string; resource: string; expires_at: string };

export type OAuthClient = { clientId: string; clientName: string; redirectUris: string[] };
export type OAuthAuthorizationRequest = { clientId: string; redirectUri: string; scope: string[]; state: string; resource: string; codeChallenge: string };
export type McpOAuthToken = { userId: string; clientId: string; scopes: string[]; resource: string; expiresAt: string };

export function oauthHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function oauthRandom(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function parseScope(raw: string | null | undefined): string[] | null {
  const scopes = [...new Set(String(raw || "mcp:read").trim().split(/\s+/).filter(Boolean))];
  return scopes.length > 0 && scopes.every((scope) => MCP_SCOPES.includes(scope as (typeof MCP_SCOPES)[number])) ? scopes : null;
}

export function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

export async function registerOAuthClient(input: { clientName: string; redirectUris: unknown }): Promise<OAuthClient> {
  const redirectUris = Array.isArray(input.redirectUris) ? [...new Set(input.redirectUris.map((value) => String(value)))] : [];
  if (!redirectUris.length || redirectUris.length > 10 || redirectUris.some((uri) => !validRedirectUri(uri))) throw new Error("invalid_redirect_uri");
  const clientId = oauthRandom("mcp_client");
  const clientName = input.clientName.trim().slice(0, 120) || "MCP client";
  await privateDb().prepare("INSERT INTO app_oauth_clients(client_id,client_name,redirect_uris_json,created_at) VALUES(?,?,?,?)").bind(clientId, clientName, JSON.stringify(redirectUris), nowIso()).run();
  return { clientId, clientName, redirectUris };
}

export async function oauthClient(clientId: string): Promise<OAuthClient | null> {
  const row = await privateDb().prepare("SELECT client_id,client_name,redirect_uris_json FROM app_oauth_clients WHERE client_id=?").bind(clientId).first<OAuthClientRow>();
  if (!row) return null;
  try {
    const redirectUris = JSON.parse(row.redirect_uris_json);
    if (!Array.isArray(redirectUris) || redirectUris.some((uri) => typeof uri !== "string" || !validRedirectUri(uri))) return null;
    return { clientId: row.client_id, clientName: row.client_name, redirectUris };
  } catch {
    return null;
  }
}

export async function parseAuthorizationRequest(url: URL): Promise<{ request: OAuthAuthorizationRequest; client: OAuthClient } | null> {
  if (url.searchParams.get("response_type") !== "code") return null;
  const clientId = String(url.searchParams.get("client_id") || "");
  const redirectUri = String(url.searchParams.get("redirect_uri") || "");
  const scope = parseScope(url.searchParams.get("scope"));
  const codeChallenge = String(url.searchParams.get("code_challenge") || "");
  const resource = String(url.searchParams.get("resource") || MCP_RESOURCE);
  const client = await oauthClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri) || !scope || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeChallenge) || url.searchParams.get("code_challenge_method") !== "S256" || resource !== MCP_RESOURCE) return null;
  return { request: { clientId, redirectUri, scope, state: String(url.searchParams.get("state") || ""), resource, codeChallenge }, client };
}

export async function userHasMcpWorkspaceAccess(userId: string): Promise<boolean> {
  const membership = await privateDb().prepare("SELECT 1 AS allowed FROM app_team_members WHERE user_id=? LIMIT 1").bind(userId).first<{ allowed?: number }>();
  return Boolean(membership?.allowed);
}

export async function issueAuthorizationCode(input: OAuthAuthorizationRequest & { userId: string }): Promise<string> {
  const code = oauthRandom("mcp_code");
  const now = nowIso();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await privateDb().prepare("INSERT INTO app_oauth_authorization_codes(code_hash,client_id,user_id,redirect_uri,scope,resource,code_challenge,expires_at,used_at,created_at) VALUES(?,?,?,?,?,?,?,?,NULL,?)").bind(oauthHash(code), input.clientId, input.userId, input.redirectUri, input.scope.join(" "), input.resource, input.codeChallenge, expiresAt, now).run();
  return code;
}

export async function exchangeAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource: string }): Promise<{ accessToken: string; expiresIn: number; scope: string } | null> {
  if (!input.code || !input.clientId || !input.redirectUri || !input.codeVerifier || input.resource !== MCP_RESOURCE) return null;
  const db = privateDb();
  const codeHash = oauthHash(input.code);
  const row = await db.prepare("SELECT client_id,user_id,redirect_uri,scope,resource,code_challenge,expires_at FROM app_oauth_authorization_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1").bind(codeHash, nowIso()).first<CodeRow>();
  if (!row || row.client_id !== input.clientId || row.redirect_uri !== input.redirectUri || row.resource !== input.resource || pkceChallenge(input.codeVerifier) !== row.code_challenge) return null;
  const used = await db.prepare("UPDATE app_oauth_authorization_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL").bind(nowIso(), codeHash).run();
  if (Number(used.meta?.changes || 0) !== 1) return null;
  const accessToken = oauthRandom("mcp_access");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await db.prepare("INSERT INTO app_oauth_access_tokens(token_hash,client_id,user_id,scope,resource,expires_at,created_at) VALUES(?,?,?,?,?,?,?)").bind(oauthHash(accessToken), row.client_id, row.user_id, row.scope, row.resource, expiresAt, nowIso()).run();
  return { accessToken, expiresIn: Math.floor(TOKEN_TTL_MS / 1000), scope: row.scope };
}

export async function mcpOAuthToken(request: Request): Promise<McpOAuthToken | null> {
  const raw = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!raw.startsWith("mcp_access_")) return null;
  const row = await privateDb().prepare("SELECT client_id,user_id,scope,resource,expires_at FROM app_oauth_access_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? LIMIT 1").bind(oauthHash(raw), nowIso()).first<TokenRow>();
  if (!row || row.resource !== MCP_RESOURCE) return null;
  const scopes = parseScope(row.scope);
  return scopes ? { userId: row.user_id, clientId: row.client_id, scopes, resource: row.resource, expiresAt: row.expires_at } : null;
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
