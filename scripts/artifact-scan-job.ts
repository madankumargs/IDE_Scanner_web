import { serviceDb } from "../lib/supabase";
import { scanArtifactSource, persistArtifactResult } from "../lib/artifactScan/runScan";
import type { ArtifactLocator } from "../lib/artifactScan/runScan";
import type { ArtifactKind } from "../lib/artifactScan/types";

const jobId = process.env.ARTIFACT_SCAN_JOB_ID;
if (!jobId) throw new Error("ARTIFACT_SCAN_JOB_ID is required.");
const db = serviceDb();
const jobResult = await db.from("artifact_scan_jobs").select("*").eq("id", jobId).single();
if (jobResult.error || !jobResult.data) throw jobResult.error || new Error("Artifact scan job was not found.");
const job = jobResult.data as { artifact_id: string; kind: ArtifactKind; locator: ArtifactLocator };
try {
  await db.from("artifact_scan_jobs").update({ status: "running", lifecycle_stage: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
  const locator = job.locator;
  const result = await scanArtifactSource(locator, job.kind);
  await persistArtifactResult(db, job.artifact_id, result);
  await db.from("artifact_scan_jobs").update({ status: "complete", lifecycle_stage: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
} catch (error) {
  const message = error instanceof Error ? error.message : "Artifact scan failed.";
  await db.from("artifact_scan_jobs").update({ status: "failed", lifecycle_stage: "failed", error: message.slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
  throw error;
}
