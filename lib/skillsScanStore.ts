import "server-only";

import { createHash } from "node:crypto";
import { privateDb, nowIso, type PrivateDatabase } from "@/lib/cloudflarePrivate";
import type { SkillScanReport } from "@/lib/skillsScanner";
import { skillScanId, splitSkillScanReport } from "@/lib/skillsScanIdentity";

export type StoredSkillScan = {
  scanId: string;
  skillId: string;
  decision: SkillScanReport["decision"];
  contentHash: string;
  scannedAt: string;
};

export async function persistSkillScanReport(report: SkillScanReport, database: PrivateDatabase = privateDb()): Promise<StoredSkillScan> {
  const scanId = skillScanId(report);
  const skillId = `${report.source.owner}/${report.source.repo}${report.source.skillPath ? `/${report.source.skillPath}` : ""}`;
  const reportJson = JSON.stringify(report);
  const chunks = splitSkillScanReport(reportJson);
  const storedReport = chunks.length === 1
    ? reportJson
    : JSON.stringify({ chunked: true, chunk_count: chunks.length, sha256: createHash("sha256").update(reportJson).digest("hex") });
  const now = nowIso();
  const statements = [
    database.prepare("DELETE FROM app_skill_scan_report_chunks WHERE scan_id=?").bind(scanId),
    database.prepare(`INSERT INTO app_skill_scan_reports(
      scan_id,skill_id,requested_url,owner,repo,ref,commit_sha,skill_path,canonical_url,commit_url,
      content_sha256,decision,risk_score,malware_score,coverage_completed,coverage_required,findings_count,
      report_json,report_chunk_count,scanned_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(scan_id) DO UPDATE SET
      skill_id=excluded.skill_id,requested_url=excluded.requested_url,owner=excluded.owner,repo=excluded.repo,
      ref=excluded.ref,commit_sha=excluded.commit_sha,skill_path=excluded.skill_path,canonical_url=excluded.canonical_url,
      commit_url=excluded.commit_url,content_sha256=excluded.content_sha256,decision=excluded.decision,
      risk_score=excluded.risk_score,malware_score=excluded.malware_score,coverage_completed=excluded.coverage_completed,
      coverage_required=excluded.coverage_required,findings_count=excluded.findings_count,report_json=excluded.report_json,
      report_chunk_count=excluded.report_chunk_count,scanned_at=excluded.scanned_at,updated_at=excluded.updated_at`).bind(
      scanId,
      skillId,
      report.source.requestedUrl,
      report.source.owner,
      report.source.repo,
      report.source.ref,
      report.source.commit,
      report.source.skillPath,
      report.source.canonicalUrl,
      report.source.commitUrl,
      report.artifact.contentHash,
      report.decision,
      report.scores.risk,
      report.scores.malware,
      report.coverage.completedRequired,
      report.coverage.requiredAnalyzers,
      report.findings.length,
      storedReport,
      chunks.length > 1 ? chunks.length : 0,
      report.scannedAt,
      now,
      now,
    ),
    ...chunks.map((chunk, index) => database.prepare("INSERT INTO app_skill_scan_report_chunks(scan_id,chunk_index,content) VALUES(?,?,?)").bind(scanId, index, chunk)),
  ];
  await database.batch(statements);
  return { scanId, skillId, decision: report.decision, contentHash: report.artifact.contentHash, scannedAt: report.scannedAt };
}
