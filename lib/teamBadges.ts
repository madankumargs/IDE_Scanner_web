import { deriveTrustTier, type TrustTier } from "@/lib/trustTiers";

export const teamBadgeStatuses = [
  "pending",
  "ready",
  "stale",
  "failed",
  "revoked",
] as const;
export type TeamBadgeStatus = (typeof teamBadgeStatuses)[number];
export const teamBadgeModes = ["exact_release", "latest"] as const;
export type TeamBadgeMode = (typeof teamBadgeModes)[number];
export type TeamBadgeVisibility = "public" | "private";

export type TeamBadge = {
  id: string;
  team_id: string;
  extension_id: string;
  display_name: string;
  mode: TeamBadgeMode;
  version: string;
  scan_id: string | null;
  scan_job_id: string | null;
  artifact_sha256: string | null;
  public_token: string;
  visibility: TeamBadgeVisibility;
  status: TeamBadgeStatus;
  decision: string | null;
  verdict: string | null;
  public_outcome: string | null;
  trust_tier: TrustTier | null;
  trust_label: string | null;
  coverage_percent: number | null;
  risk_score: number | null;
  malware_score: number | null;
  scanned_at: string | null;
  last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ScanLike = Record<string, unknown>;

export function badgeKey(extensionId: string, version: string): string {
  return `${extensionId.trim().toLowerCase()}@${version.trim()}`;
}

export function deriveTeamBadgeStatus(
  badge: Pick<TeamBadge, "status" | "version">,
  observedVersion: string | null | undefined,
): TeamBadgeStatus {
  if (badge.status === "revoked" || badge.status === "failed" || badge.status === "pending") {
    return badge.status;
  }
  const observed = String(observedVersion || "").trim();
  if (observed && observed !== badge.version) return "stale";
  return "ready";
}

const allowedStatusTransitions: Record<TeamBadgeStatus, readonly TeamBadgeStatus[]> = {
  pending: ["pending", "ready", "failed", "revoked"],
  ready: ["ready", "stale", "revoked"],
  stale: ["stale", "pending", "ready", "revoked"],
  failed: ["failed", "pending", "revoked"],
  revoked: ["revoked"],
};

export function transitionTeamBadgeStatus(
  current: TeamBadgeStatus,
  next: TeamBadgeStatus,
): TeamBadgeStatus {
  if (!allowedStatusTransitions[current].includes(next)) {
    throw new Error(`Cannot transition a ${current} badge to ${next}.`);
  }
  return next;
}

export function teamBadgeFromScan(
  scan: ScanLike,
  base: Pick<TeamBadge, "id" | "team_id" | "created_by" | "created_at" | "updated_at"> &
    Partial<Pick<TeamBadge, "display_name" | "scan_job_id" | "last_error" | "public_token" | "visibility">>,
): TeamBadge {
  const extensionId = stringValue(scan.extension_id);
  const version = stringValue(scan.version);
  const status = stringValue(scan.analysis_status) === "complete" ? "ready" : "pending";
  const coveragePercent = numberValue(
    scan.coverage_percent ?? objectValue(scan.analysis_coverage).coverage_percent,
  );
  const tier = status === "ready"
    ? deriveTrustTier({
        ...scan,
        analysis_coverage:
          objectValue(scan.analysis_coverage).status
            ? scan.analysis_coverage
            : { status: coveragePercent !== null && coveragePercent >= 100 ? "complete" : "incomplete" },
      })
    : null;

  return {
    id: base.id,
    team_id: base.team_id,
    extension_id: extensionId,
    display_name: base.display_name || extensionId,
    mode: "exact_release",
    version,
    scan_id: stringOrNull(scan.id || scan.scan_id),
    scan_job_id: base.scan_job_id || stringOrNull(scan.scan_job_id),
    artifact_sha256: stringOrNull(scan.artifact_sha256),
    public_token: base.public_token || "",
    visibility: base.visibility || "public",
    status,
    decision: stringOrNull(scan.decision),
    verdict: stringOrNull(scan.verdict),
    public_outcome: stringOrNull(scan.public_outcome),
    trust_tier: tier?.tier || null,
    trust_label: tier?.label || null,
    coverage_percent: coveragePercent,
    risk_score: boundedScore(scan.risk_score),
    malware_score: boundedScore(scan.malware_score),
    scanned_at: stringOrNull(scan.scanned_at || scan.created_at),
    last_error: base.last_error || null,
    created_by: base.created_by,
    created_at: base.created_at,
    updated_at: base.updated_at,
  };
}

export function normalizeTeamBadge(value: unknown): TeamBadge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = stringValue(row.id);
  const teamId = stringValue(row.team_id);
  const extensionId = stringValue(row.extension_id);
  const version = stringValue(row.version);
  const status = row.status;
  if (!id || !teamId || !extensionId || !version || !teamBadgeStatuses.includes(status as TeamBadgeStatus)) return null;
  return {
    id,
    team_id: teamId,
    extension_id: extensionId,
    display_name: stringValue(row.display_name) || extensionId,
    mode: teamBadgeMode(row.mode),
    version,
    scan_id: stringOrNull(row.scan_id),
    scan_job_id: stringOrNull(row.scan_job_id),
    artifact_sha256: stringOrNull(row.artifact_sha256),
    public_token: stringValue(row.public_token),
    visibility: row.visibility === "private" ? "private" : "public",
    status: status as TeamBadgeStatus,
    decision: stringOrNull(row.decision),
    verdict: stringOrNull(row.verdict),
    public_outcome: stringOrNull(row.public_outcome),
    trust_tier: teamTrustTier(row.trust_tier),
    trust_label: stringOrNull(row.trust_label),
    coverage_percent: numberValue(row.coverage_percent),
    risk_score: boundedScore(row.risk_score),
    malware_score: boundedScore(row.malware_score),
    scanned_at: stringOrNull(row.scanned_at),
    last_error: stringOrNull(row.last_error),
    created_by: stringValue(row.created_by),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
  };
}

export function badgePublicPaths(
  badge: Pick<TeamBadge, "extension_id" | "version" | "scan_id" | "public_token">,
) {
  const extension = encodeURIComponent(badge.extension_id);
  const version = encodeURIComponent(badge.version);
  const report = badge.scan_id
    ? `/extensions/${extension}/versions/${version}/scans/${encodeURIComponent(badge.scan_id)}`
    : `/extensions/${extension}/versions/${version}`;
  return {
    badge: badge.public_token
      ? `/api/team-badges/${encodeURIComponent(badge.public_token)}`
      : `/api/badge?extension=${extension}&version=${version}`,
    report,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value: unknown): string | null {
  const result = stringValue(value);
  return result || null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function boundedScore(value: unknown): number | null {
  const result = numberValue(value);
  return result === null ? null : Math.max(0, Math.min(100, result));
}

function teamTrustTier(value: unknown): TrustTier | null {
  return ["verified", "analyzed", "attention", "confirmed_risk", "unanalyzed"].includes(String(value))
    ? (String(value) as TrustTier)
    : null;
}

function teamBadgeMode(value: unknown): TeamBadgeMode {
  return teamBadgeModes.includes(value as TeamBadgeMode)
    ? value as TeamBadgeMode
    : "exact_release";
}
