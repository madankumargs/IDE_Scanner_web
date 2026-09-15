import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { privateDb, nowIso } from "@/lib/cloudflarePrivate";
import { sendAuthCode } from "@/lib/cloudflareEmail";
import { runtimeEnv } from "@/lib/runtimeEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const db = privateDb();
  const existing = await db.prepare("SELECT created_at FROM app_email_auth_codes WHERE email=?").bind(email).first<{ created_at?: unknown }>();
  if (existing?.created_at && Date.now() - Date.parse(String(existing.created_at)) < 60_000) {
    return NextResponse.json({ error: "Wait a minute before requesting another code." }, { status: 429 });
  }
  const code = codeValue();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await db
    .prepare(
      `INSERT INTO app_email_auth_codes(email,code_hash,attempts,expires_at,created_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,created_at=excluded.created_at`,
    )
    .bind(email, codeHash(email, code), 0, expiresAt, createdAt)
    .run();
  try {
    await sendAuthCode(email, code);
  } catch {
    await db.prepare("DELETE FROM app_email_auth_codes WHERE email=? AND code_hash=?").bind(email, codeHash(email, code)).run();
    return NextResponse.json({ error: "Email sign-in is not configured yet. Use GitHub or Google for now." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, message: "Enter the sign-in code we sent to your email." });
}

function codeValue(): string {
  const value = randomBytes(4).readUInt32BE(0);
  return String(value % 1_000_000).padStart(6, "0");
}

export function codeHash(email: string, code: string): string {
  const secret = runtimeEnv("MONITORING_ENCRYPTION_KEY") || runtimeEnv("SCAN_RATE_LIMIT_SECRET") || "guardrails-email-auth";
  return createHash("sha256").update(`${secret}:${email}:${code}`).digest("hex");
}
