import { createHash } from "node:crypto";
import type { SkillScanReport } from "@/lib/skillsScanner";

export const SKILL_SCAN_REPORT_CHUNK_CHARS = 80_000;

export function skillScanId(report: SkillScanReport) {
  const identity = `${report.source.owner}/${report.source.repo}/${report.source.skillPath}@${report.source.commit}`;
  return `skill-${createHash("sha256").update(identity).digest("hex").slice(0, 40)}`;
}

export function splitSkillScanReport(reportJson: string) {
  const chunks: string[] = [];
  for (let index = 0; index < reportJson.length; index += SKILL_SCAN_REPORT_CHUNK_CHARS) chunks.push(reportJson.slice(index, index + SKILL_SCAN_REPORT_CHUNK_CHARS));
  return chunks;
}
