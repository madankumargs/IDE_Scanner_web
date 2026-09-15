import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { privateDb, nowIso } from "@/lib/cloudflarePrivate";
import { sendAuthCode } from "@/lib/cloudflareEmail";
import { runtimeEnv } from "@/lib/runtimeEnv";
import { runtimeSupabase } from "@/lib/supabaseRuntime";

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

  let d1Db: ReturnType<typeof privateDb> | null = null;
  let issuedHash = "";
  try {
    d1Db = privateDb();
    const existing = await d1Db.prepare("SELECT created_at FROM app_email_auth_codes WHERE email=?").bind(email).first<{ created_at?: unknown }>();
    if (existing?.created_at && Date.now() - Date.parse(String(existing.created_at)) < 60_000) {
      return NextResponse.json({ error: "Wait a minute before requesting another code." }, { status: 429 });
    }
    const code = codeValue();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    issuedHash = codeHash(email, code);
    await d1Db
      .prepare(
        `INSERT INTO app_email_auth_codes(email,code_hash,attempts,expires_at,created_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,created_at=excluded.created_at`,
      )
      .bind(email, issuedHash, 0, expiresAt, createdAt)
      .run();
    await sendAuthCode(email, code);
    return NextResponse.json({ ok: true, message: "Enter the sign-in code we sent to your email." });
  } catch {
    if (d1Db && issuedHash) {
      await d1Db.prepare("DELETE FROM app_email_auth_codes WHERE email=? AND code_hash=?").bind(email, issuedHash).run().catch(() => undefined);
    }
    // Email Sending is paid-only on the current Cloudflare account. Use the
    // existing Supabase Auth SMTP provider as a delivery-only fallback;
    // users and sessions still land in Cloudflare D1 after verification.
    const supabase = runtimeSupabase();
    if (supabase) {
      const result = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (!result.error) return NextResponse.json({ ok: true, message: "Enter the sign-in code we sent to your email." });
    }
    return NextResponse.json({ error: "Email sign-in is not available right now. Use Google or GitHub instead." }, { status: 503 });
  }
}

function codeValue(): string {
  const value = randomBytes(4).readUInt32BE(0);
  return String(value % 1_000_000).padStart(6, "0");
}

export function codeHash(email: string, code: string): string {
  const secret = runtimeEnv("MONITORING_ENCRYPTION_KEY") || runtimeEnv("SCAN_RATE_LIMIT_SECRET") || "guardrails-email-auth";
  return createHash("sha256").update(`${secret}:${email}:${code}`).digest("hex");
}
