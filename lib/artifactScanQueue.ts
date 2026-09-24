import { serviceDb } from "@/lib/supabase";
import { runtimeEnv } from "@/lib/runtimeEnv";
import { resolve, type ResolvedArtifact } from "@/lib/artifactSources";
import type { ArtifactKind } from "@/lib/artifactScan";

export async function queueArtifactScan(raw: string, kind: ArtifactKind, requestedBy: string, version?: string) {
  const resolved = resolve(raw, kind, version); const db = serviceDb();
  const artifact = await db.from("artifacts").upsert({ kind: resolved.kind, display_name: resolved.display_name, source: resolved.source, source_ref: resolved.source_ref, owner: resolved.owner, updated_at: new Date().toISOString() }, { onConflict: "kind,source,source_ref" }).select("*").single();
  if (artifact.error) throw artifact.error;
  const artifactId = String(artifact.data.id);
  const artifactVersion = await db.from("artifact_versions").upsert({ artifact_id: artifactId, version: resolved.version }, { onConflict: "artifact_id,version" }).select("*").single();
  if (artifactVersion.error) throw artifactVersion.error;
  const active = await db.from("artifact_scan_jobs").select("*").eq("artifact_id", artifactId).eq("artifact_version", resolved.version).in("status", ["queued", "running"]).maybeSingle();
  if (active.error) throw active.error;
  if (active.data) { if (active.data.status === "queued") await dispatchArtifactScan(String(active.data.id)); return { ...active.data, deduplicated: true }; }
  const job = await db.from("artifact_scan_jobs").insert({ artifact_id: artifactId, artifact_version: resolved.version, kind: resolved.kind, source: resolved.source, source_ref: resolved.source_ref, locator: resolved.locator, requested_by: requestedBy, status: "queued", lifecycle_stage: "queued" }).select("*").single();
  if (job.error) throw job.error;
  await db.from("artifact_scan_job_events").insert({ job_id: job.data.id, stage: "queued", event_type: "created", detail: { source: resolved.source, source_ref: resolved.source_ref, requested_by: requestedBy } });
  await dispatchArtifactScan(String(job.data.id));
  return { ...job.data, dispatch: "started" };
}

export async function dispatchArtifactScan(jobId: string): Promise<boolean> {
  const token = runtimeEnv("GITHUB_ACTIONS_TOKEN"); if (!token) throw new Error("Artifact scan dispatch is not configured.");
  const owner = runtimeEnv("GITHUB_REPO_OWNER") || "preethamak"; const repository = runtimeEnv("GITHUB_SCANNER_REPO") || "IDE_Scanner";
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/artifact-scan.yml/dispatches`;
  const response = await fetch(url, { method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }), cache: "no-store" });
  if (!response.ok) throw new Error(`Artifact scan dispatch failed (${response.status}).`);
  const now = new Date().toISOString(); const db = serviceDb();
  await db.from("artifact_scan_jobs").update({ lifecycle_stage: "dispatched", dispatch_succeeded_at: now, updated_at: now }).eq("id", jobId).eq("status", "queued");
  await db.from("artifact_scan_job_events").insert({ job_id: jobId, stage: "dispatched", event_type: "dispatch_accepted", detail: { repository: `${owner}/${repository}` } });
  return true;
}

export type { ResolvedArtifact };
