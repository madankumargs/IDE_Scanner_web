import type { PresentedTeamBadge } from "@/lib/teamBadgePresentation";

export type TeamBadgeExport = Pick<PresentedTeamBadge,
  "id" | "extension_id" | "display_name" | "version" | "status" | "visibility" |
  "trust_tier" | "trust_label" | "coverage_percent" | "risk_score" | "malware_score" |
  "scanned_at" | "badge_url" | "report_url"
> & { public: boolean };

export function exportBadgeRecord(badge: PresentedTeamBadge): TeamBadgeExport {
  return {
    id: badge.id,
    extension_id: badge.extension_id,
    display_name: badge.display_name,
    version: badge.version,
    status: badge.status,
    visibility: badge.visibility,
    trust_tier: badge.trust_tier,
    trust_label: badge.trust_label,
    coverage_percent: badge.coverage_percent,
    risk_score: badge.risk_score,
    malware_score: badge.malware_score,
    scanned_at: badge.scanned_at,
    badge_url: badge.visibility === "public" && ["ready", "stale"].includes(badge.status) ? badge.badge_url : "",
    report_url: badge.report_url,
    public: badge.visibility === "public" && ["ready", "stale"].includes(badge.status),
  };
}

export function renderBadgeMarkdown(badges: PresentedTeamBadge[], siteUrl: string): string {
  const rows = badges.map((badge) => {
    const record = exportBadgeRecord(badge);
    const link = absolute(siteUrl, record.report_url);
    const badgeImage = record.public
      ? `[![GuardRails ${badge.extension_id}@${badge.version}](${absolute(siteUrl, record.badge_url)})](${link})`
      : "Not published";
    return `| ${escapeCell(badge.display_name)} | \`${escapeCell(badge.extension_id)}@${escapeCell(badge.version)}\` | ${badgeStatus(badge.status)} | ${badgeImage} |`;
  });
  return [
    "# GuardRails trust inventory",
    "",
    "> Generated from the team Badge Studio. Exact-release badges never silently change; refresh a release when monitoring reports a newer version.",
    "",
    "| Extension | Exact release | Health | Badge |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `Generated ${new Date().toISOString()}. Open the workspace to review evidence and publication settings.`,
    "",
  ].join("\n");
}

export function renderBadgeSnippets(badges: PresentedTeamBadge[], siteUrl: string): string {
  return badges.filter((badge) => badge.visibility === "public" && ["ready", "stale"].includes(badge.status)).map((badge) => {
    const record = exportBadgeRecord(badge);
    return `## ${badge.extension_id}@${badge.version}\n\n[![GuardRails analysis](${absolute(siteUrl, record.badge_url)})](${absolute(siteUrl, record.report_url)})`;
  }).join("\n\n");
}

function absolute(siteUrl: string, path: string): string {
  return new URL(path, siteUrl).toString();
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function badgeStatus(value: string): string {
  return value === "ready" ? "Ready" : value === "stale" ? "Release changed" : value === "pending" ? "Scanning" : value === "failed" ? "Needs retry" : "Revoked";
}
