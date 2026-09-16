import {
  badgePublicPaths,
  deriveTeamBadgeStatus,
  normalizeTeamBadge,
  type TeamBadge,
} from "@/lib/teamBadges";

export type PresentedTeamBadge = TeamBadge & {
  badge_url: string;
  report_url: string;
};

/** Add derived URLs and release freshness without changing stored identity. */
export function presentTeamBadge(
  value: unknown,
  observedVersion?: string | null,
): PresentedTeamBadge | null {
  const badge = normalizeTeamBadge(value);
  if (!badge) return null;
  const status = deriveTeamBadgeStatus(badge, observedVersion);
  const current = status === badge.status ? badge : { ...badge, status };
  const paths = badgePublicPaths(current);
  return { ...current, badge_url: paths.badge, report_url: paths.report };
}
