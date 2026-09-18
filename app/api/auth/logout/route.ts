import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession, isSecureRequest } from "@/lib/cloudflarePrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { await deleteSession(request); } catch { /* Expired sessions are already logged out. */ }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie(isSecureRequest(request)));
  return response;
}
