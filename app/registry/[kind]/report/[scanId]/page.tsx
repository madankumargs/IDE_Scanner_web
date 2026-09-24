import { notFound } from "next/navigation";
import ArtifactReport from "@/app/registry/ArtifactReport";
import { serviceDb } from "@/lib/supabase";
import { serverDb } from "@/lib/supabaseServer";
export const dynamic = "force-dynamic";

export default async function ArtifactReportPage({ params }: { params: Promise<{ kind: string; scanId: string }> }) {
  const route = await params; const allowed = new Set(["skills", "plugins", "mcp-servers"]); if (!allowed.has(route.kind)) notFound();
  const auth = await serverDb().then((db) => db.auth.getUser()).catch(() => null); if (!auth?.data.user) notFound();
  const db = serviceDb(); const scan = await db.from("artifact_scans").select("*").eq("id", route.scanId).maybeSingle(); if (scan.error || !scan.data) notFound();
  const artifact = await db.from("artifacts").select("*").eq("id", scan.data.artifact_id).maybeSingle(); if (artifact.error || !artifact.data) notFound();
  return <ArtifactReport artifact={artifact.data} scan={scan.data} kind={route.kind} />;
}
