import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type PrivateRow = Record<string, unknown>;
type PrivateResult<T extends PrivateRow = PrivateRow> = {
  results: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
};

export type PrivateDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T extends PrivateRow = PrivateRow>(): Promise<PrivateResult<T>>;
      first<T extends PrivateRow = PrivateRow>(): Promise<T | null>;
      run(): Promise<PrivateResult>;
    };
    all<T extends PrivateRow = PrivateRow>(): Promise<PrivateResult<T>>;
    first<T extends PrivateRow = PrivateRow>(): Promise<T | null>;
    run(): Promise<PrivateResult>;
  };
  batch<T = PrivateResult>(statements: unknown[]): Promise<T[]>;
};

export type AppUser = {
  id: string;
  email: string;
  display_name: string;
  provider: string;
  provider_subject: string;
};

export type AppProfile = {
  user_id: string;
  role: string | null;
  primary_ide: string | null;
  use_case: string | null;
  onboarding_completed: boolean;
};

export type AppAuthUser = AppUser & {
  user_metadata: { full_name?: string; user_name?: string };
  app_metadata: { provider: string };
};

export function privateDb(): PrivateDatabase {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const db = env.ABSCISSA_REGISTRY as PrivateDatabase | undefined;
    if (db) return db;
  } catch {
    // Local tests and the Node dev server do not have a Cloudflare context.
  }
  throw new Error("Cloudflare D1 private storage is not available.");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function newSessionToken(): string {
  return `gr_${randomBytes(32).toString("base64url")}`;
}

export function tokenFromRequest(request: Request): string {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (bearer?.startsWith("gr_")) return bearer;
  const cookies = parseCookies(request.headers.get("cookie") || "");
  return String(cookies.gr_session || "");
}

export function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

export function sessionHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function userFromSession(request: Request): Promise<AppAuthUser | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const row = await privateDb()
    .prepare(
      `SELECT u.id,u.email,u.display_name,u.provider,u.provider_subject
       FROM app_sessions s JOIN app_users u ON u.id=s.user_id
       WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`,
    )
    .bind(sessionHash(token), nowIso())
    .first<AppUser>();
  return row ? toAuthUser(row) : null;
}

export function toAuthUser(user: AppUser): AppAuthUser {
  return {
    ...user,
    user_metadata: { full_name: user.display_name, user_name: user.display_name },
    app_metadata: { provider: user.provider },
  };
}

export async function profileForUser(userId: string): Promise<AppProfile | null> {
  const row = await privateDb()
    .prepare("SELECT user_id,role,primary_ide,use_case,onboarding_completed FROM app_profiles WHERE user_id=?")
    .bind(userId)
    .first<PrivateRow>();
  return row
    ? {
        user_id: String(row.user_id),
        role: row.role ? String(row.role) : null,
        primary_ide: row.primary_ide ? String(row.primary_ide) : null,
        use_case: row.use_case ? String(row.use_case) : null,
        onboarding_completed: Number(row.onboarding_completed || 0) === 1,
      }
    : null;
}

export async function upsertGithubUser(input: {
  subject: string;
  email: string;
  displayName: string;
}): Promise<AppAuthUser> {
  return upsertExternalUser({ ...input, provider: "github", idPrefix: "github" });
}

export async function upsertGoogleUser(input: {
  subject: string;
  email: string;
  displayName: string;
}): Promise<AppAuthUser> {
  return upsertExternalUser({ ...input, provider: "google", idPrefix: "google" });
}

export async function upsertEmailUser(email: string): Promise<AppAuthUser> {
  const db = privateDb();
  const existing = await db
    .prepare("SELECT id,email,display_name,provider,provider_subject FROM app_users WHERE email=? OR provider_subject=? LIMIT 1")
    .bind(email, `email:${email}`)
    .first<AppUser>();
  const user = existing || {
    id: `email:${email}`,
    email,
    display_name: email.split("@")[0].slice(0, 120),
    provider: "email",
    provider_subject: `email:${email}`,
  } satisfies AppUser;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO app_users(id,email,display_name,provider,provider_subject,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET updated_at=excluded.updated_at`,
    )
    .bind(user.id, email, user.display_name, user.provider, user.provider_subject, now, now)
    .run();
  return toAuthUser({ ...user, email });
}

async function upsertExternalUser(input: {
  subject: string;
  email: string;
  displayName: string;
  provider: "github" | "google";
  idPrefix: string;
}): Promise<AppAuthUser> {
  const db = privateDb();
  const existing = await db
    .prepare("SELECT id,email,display_name,provider,provider_subject FROM app_users WHERE provider_subject=? OR email=? LIMIT 1")
    .bind(input.subject, input.email)
    .first<AppUser>();
  const now = nowIso();
  if (existing) {
    await db
      .prepare("UPDATE app_users SET email=?,display_name=?,updated_at=? WHERE id=?")
      .bind(input.email, input.displayName, now, existing.id)
      .run();
    return toAuthUser({ ...existing, email: input.email, display_name: input.displayName });
  }
  const user = existing || {
    id: `${input.idPrefix}:${input.subject}`,
    email: input.email,
    display_name: input.displayName,
    provider: input.provider,
    provider_subject: input.subject,
  } satisfies AppUser;
  await db
    .prepare(
      `INSERT INTO app_users(id,email,display_name,provider,provider_subject,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(provider_subject) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at`,
    )
    .bind(user.id, input.email, input.displayName, user.provider, user.provider_subject, now, now)
    .run();
  return toAuthUser({ ...user, email: input.email, display_name: input.displayName });
}

export async function createSession(userId: string): Promise<string> {
  const token = newSessionToken();
  const now = nowIso();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await privateDb()
    .prepare("INSERT INTO app_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(sessionHash(token), userId, expires, now)
    .run();
  return token;
}

export async function deleteSession(request: Request): Promise<void> {
  const token = tokenFromRequest(request);
  if (!token) return;
  await privateDb().prepare("DELETE FROM app_sessions WHERE token_hash=?").bind(sessionHash(token)).run();
}

export function sessionCookie(token: string, maxAge = 30 * 24 * 60 * 60): string {
  return `gr_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

export function safeNext(value: string | null | undefined): string {
  const next = String(value || "/workspace");
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/workspace";
}

export async function workspaceState(teamId: string): Promise<Record<string, unknown>> {
  const row = await privateDb().prepare("SELECT state_json FROM app_team_state WHERE team_id=?").bind(teamId).first<PrivateRow>();
  if (!row?.state_json) return {};
  try {
    const value = JSON.parse(String(row.state_json));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function saveWorkspaceState(teamId: string, state: Record<string, unknown>): Promise<void> {
  await privateDb()
    .prepare(
      `INSERT INTO app_team_state(team_id,state_json,updated_at) VALUES(?,?,?)
       ON CONFLICT(team_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`,
    )
    .bind(teamId, JSON.stringify(state), nowIso())
    .run();
}

export function jsonValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
