export const TEAM_BADGE_LIMITS = {
  max_published_records: 50,
  max_active_scans: 3,
} as const;

export function badgeLimitMessage(kind: keyof typeof TEAM_BADGE_LIMITS): string {
  return kind === "max_active_scans"
    ? "Three badge scans are already running for this workspace. Wait for one to finish before refreshing another release."
    : "This workspace has reached its 50 exact-release badge limit. Revoke an old badge before adding another.";
}
