import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { discoverPublicGitHubSkillUrls, scanPublicGitHubSkill, type PublicGitHubSkillCandidate, type SkillScanReport } from "@/lib/skillsScanner";
import { skillScanId, splitSkillScanReport } from "@/lib/skillsScanIdentity";

const sources = [
  "https://github.com/obra/superpowers",
  "https://github.com/mattpocock/skills",
  "https://github.com/anthropics/skills",
  "https://github.com/emavv/karpathy-guidelines/tree/master/codex/karpathy-guidelines",
  "https://github.com/addyosmani/agent-skills",
  "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
  "https://github.com/JuliusBrussee/caveman",
  "https://github.com/OneWave-AI/claude-skills",
  "https://github.com/ognjengt/founder-skills",
  "https://github.com/kepano/obsidian-skills",
  "https://github.com/yigityildiz0/scientific-agent-skills",
  "https://github.com/linear/linear-claude-skill",
  "https://github.com/vercel-labs/skills/tree/main/skills/find-skills",
  "https://github.com/remotion-dev/remotion/tree/main/packages/skills/skills/remotion",
] as const;

const maxSkills = Math.min(Math.max(Number(process.argv.find((arg) => arg.startsWith("--max="))?.split("=")[1] || 100) || 100, 1), 100);
const outputPath = resolve(process.argv.find((arg) => arg.startsWith("--sql="))?.split("=").slice(1).join("=") || ".tmp/top-skills-scan.sql");
const summaryPath = resolve(process.argv.find((arg) => arg.startsWith("--summary="))?.split("=").slice(1).join("=") || ".tmp/top-skills-scan-summary.json");

function sql(value: unknown) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlForReport(report: SkillScanReport) {
  const scanId = skillScanId(report);
  const skillId = `${report.source.owner}/${report.source.repo}${report.source.skillPath ? `/${report.source.skillPath}` : ""}`;
  const reportJson = JSON.stringify(report);
  const chunks = splitSkillScanReport(reportJson);
  const storedReport = chunks.length === 1
    ? reportJson
    : JSON.stringify({ chunked: true, chunk_count: chunks.length, sha256: createHash("sha256").update(reportJson).digest("hex") });
  const values = [
    scanId, skillId, report.source.requestedUrl, report.source.owner, report.source.repo, report.source.ref,
    report.source.commit, report.source.skillPath, report.source.canonicalUrl, report.source.commitUrl,
    report.artifact.contentHash, report.decision, report.scores.risk, report.scores.malware,
    report.coverage.completedRequired, report.coverage.requiredAnalyzers, report.findings.length, storedReport,
    chunks.length > 1 ? chunks.length : 0, report.scannedAt, report.scannedAt, report.scannedAt,
  ];
  const statements = [
    `DELETE FROM app_skill_scan_report_chunks WHERE scan_id=${sql(scanId)};`,
    `INSERT INTO app_skill_scan_reports(scan_id,skill_id,requested_url,owner,repo,ref,commit_sha,skill_path,canonical_url,commit_url,content_sha256,decision,risk_score,malware_score,coverage_completed,coverage_required,findings_count,report_json,report_chunk_count,scanned_at,created_at,updated_at) VALUES(${values.map(sql).join(",")}) ON CONFLICT(scan_id) DO UPDATE SET skill_id=excluded.skill_id,requested_url=excluded.requested_url,owner=excluded.owner,repo=excluded.repo,ref=excluded.ref,commit_sha=excluded.commit_sha,skill_path=excluded.skill_path,canonical_url=excluded.canonical_url,commit_url=excluded.commit_url,content_sha256=excluded.content_sha256,decision=excluded.decision,risk_score=excluded.risk_score,malware_score=excluded.malware_score,coverage_completed=excluded.coverage_completed,coverage_required=excluded.coverage_required,findings_count=excluded.findings_count,report_json=excluded.report_json,report_chunk_count=excluded.report_chunk_count,scanned_at=excluded.scanned_at,updated_at=excluded.updated_at;`,
    ...chunks.map((chunk, index) => `INSERT INTO app_skill_scan_report_chunks(scan_id,chunk_index,content) VALUES(${sql(scanId)},${index},${sql(chunk)});`),
  ];
  return statements.join("\n");
}

async function main() {
  const discoveredBySource: PublicGitHubSkillCandidate[][] = [];
  const discovery: Array<Record<string, unknown>> = [];
  for (const source of sources) {
    try {
      const found = await discoverPublicGitHubSkillUrls(source, maxSkills);
      discoveredBySource.push(found);
      discovery.push({ source, status: "discovered", count: found.length });
    } catch (error) {
      discoveredBySource.push([]);
      discovery.push({ source, status: "unavailable", error: error instanceof Error ? error.message : String(error) });
    }
  }

  const candidates: PublicGitHubSkillCandidate[] = [];
  const seen = new Set<string>();
  for (let index = 0; candidates.length < maxSkills; index += 1) {
    let added = false;
    for (const sourceCandidates of discoveredBySource) {
      const candidate = sourceCandidates[index];
      if (!candidate) continue;
      const key = `${candidate.owner}/${candidate.repo}/${candidate.skillPath}@${candidate.commit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      added = true;
      if (candidates.length >= maxSkills) break;
    }
    if (!added) break;
  }

  const reports: SkillScanReport[] = [];
  const scans: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    try {
      const report = await scanPublicGitHubSkill(candidate.sourceUrl);
      reports.push(report);
      scans.push({ scanId: skillScanId(report), skillId: `${report.source.owner}/${report.source.repo}${report.source.skillPath ? `/${report.source.skillPath}` : ""}`, decision: report.decision, findings: report.findings.length, coverage: `${report.coverage.completedRequired}/${report.coverage.requiredAnalyzers}` });
      console.log(`[scan] ${candidate.owner}/${candidate.repo}/${candidate.skillPath} → ${report.decision}`);
    } catch (error) {
      scans.push({ sourceUrl: candidate.sourceUrl, status: "failed", error: error instanceof Error ? error.message : String(error) });
      console.error(`[scan-failed] ${candidate.sourceUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sqlText = ["BEGIN;", ...reports.map(sqlForReport), "COMMIT;", ""].join("\n");
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(outputPath, sqlText, "utf8");
  await writeFile(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), requestedSources: sources, candidates: candidates.length, reports: reports.length, discovery, scans, sqlPath: outputPath }, null, 2), "utf8");
  console.log(`[complete] ${reports.length} reports written to ${outputPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
