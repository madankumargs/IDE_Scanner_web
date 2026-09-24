import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { serviceDb } from "@/lib/supabase";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticated(request).catch(() => null);
  if (!auth) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params; const db = serviceDb();
  const job = await db.from("artifact_scan_jobs").select("*").eq("id", id).single();
  if (job.error || !job.data) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (String(job.data.requested_by) !== String(auth.user.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let scan = null;
  if (job.data.status === "complete") scan = (await db.from("artifact_scans").select("*").eq("artifact_id", job.data.artifact_id).order("scanned_at", { ascending: false }).limit(1).maybeSingle()).data;
  return NextResponse.json({ job: job.data, scan });
}
