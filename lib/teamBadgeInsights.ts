import type { TeamBadge } from "@/lib/teamBadges";

export type TeamBadgeInsight = {
  previous_version: string | null;
  previous_scanned_at: string | null;
  risk_delta: number | null;
  malware_delta: number | null;
  added_capabilities: string[];
  removed_capabilities: string[];
  changed: boolean;
  review_status: "review" | "allow" | "block" | "incomplete" | "unknown";
  recommendation: string;
};

/** Keep the workspace explanation concise; the immutable report remains the evidence source. */
export function badgeInsight(
  current: Pick<TeamBadge, "version" | "scanned_at" | "risk_score" | "malware_score" | "decision" | "capability_assessment">,
  previous?: Pick<TeamBadge, "version" | "scanned_at" | "risk_score" | "malware_score" | "capability_assessment"> | null,
): TeamBadgeInsight {
  const added = difference(capabilities(current.capability_assessment), capabilities(previous?.capability_assessment));
  const removed = difference(capabilities(previous?.capability_assessment), capabilities(current.capability_assessment));
  const riskDelta = delta(current.risk_score, previous?.risk_score);
  const malwareDelta = delta(current.malware_score, previous?.malware_score);
  const changed = Boolean(previous && (
    current.version !== previous.version ||
    (riskDelta !== null && riskDelta !== 0) ||
    (malwareDelta !== null && malwareDelta !== 0) ||
    added.length || removed.length
  ));
  const reviewStatus = decision(current.decision);
  return {
    previous_version: previous?.version || null,
    previous_scanned_at: previous?.scanned_at || null,
    risk_delta: riskDelta,
    malware_delta: malwareDelta,
    added_capabilities: added,
    removed_capabilities: removed,
    changed,
    review_status: reviewStatus,
    recommendation: recommendation(reviewStatus, changed, added.length, removed.length),
  };
}

function capabilities(value: Record<string, unknown> | null | undefined): string[] {
  if (!value) return [];
  const candidates = [value.capabilities, value.added_capabilities, value.requested_capabilities, value.permissions];
  return [...new Set(candidates.flatMap((candidate) => Array.isArray(candidate)
    ? candidate.map((item) => typeof item === "string" ? item.trim() : typeof item === "object" && item ? String((item as Record<string, unknown>).name || (item as Record<string, unknown>).capability || "").trim() : "").filter(Boolean)
    : []))].sort();
}

function difference(left: string[], right: string[]): string[] {
  const other = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => !other.has(item.toLowerCase()));
}

function delta(current: number | null, previous: number | null | undefined): number | null {
  return current !== null && previous !== null && previous !== undefined ? Math.round((current - previous) * 100) / 100 : null;
}

function decision(value: string | null | undefined): TeamBadgeInsight["review_status"] {
  return value === "review" || value === "allow" || value === "block" || value === "incomplete" ? value : "unknown";
}

function recommendation(status: TeamBadgeInsight["review_status"], changed: boolean, added: number, removed: number): string {
  if (status === "block") return "Keep this release blocked until a reviewer records an exception.";
  if (status === "incomplete") return "Do not treat this release as approved until coverage completes.";
  if (status === "review" || (changed && added > 0)) return "Open the exact report and confirm the new release before publishing it.";
  if (changed && removed > 0) return "Review the exact report; capabilities changed since the prior badge.";
  return "The exact report is the source of truth for this release.";
}
