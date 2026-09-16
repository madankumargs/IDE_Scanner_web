import { deriveTrustTier, trustBadgeText, type TrustTierInput } from "@/lib/trustTiers";

export const badgeTierColors: Record<string, string> = {
  verified: "#2fa96c",
  analyzed: "#31708f",
  attention: "#d99a1f",
  confirmed_risk: "#b32232",
  unanalyzed: "#6b7783",
};

export function renderTrustBadgeSvg(
  scan: TrustTierInput & { version?: unknown; risk_score?: unknown },
) {
  const info = deriveTrustTier(scan);
  return renderBadgeSvg(
    trustBadgeText(info, stringOrNull(scan.version), numberOrNull(scan.risk_score)),
    badgeTierColors[info.tier] || badgeTierColors.analyzed,
    `${info.label} (${stringOrNull(scan.version) || "latest"})`,
  );
}

export function renderBadgeSvg(label: string, fill: string, ariaLabel: string) {
  const font = 'font-family="Verdana,Geneva,sans-serif" font-size="11" font-weight="600"';
  const leftWidth = 86;
  const rightWidth = Math.min(Math.max(7 + label.length * 6.2, 40), 300);
  const width = leftWidth + rightWidth;
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="guardrails: ${escapeXml(ariaLabel)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${leftWidth}" height="20" fill="#17212c"/>
<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${escapeXml(fill)}"/>
<rect width="${width}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" ${font}>
<text x="${leftWidth / 2}" y="14" fill="#fff">guardrails</text>
<text x="${leftWidth + rightWidth / 2}" y="14" fill="#101820">${escapeXml(label)}</text>
</g>
</svg>`;
  return new Response(body, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Publication and revocation are workspace controls. Keep the public
      // asset cacheable, but bound the stale window so a revoked token does
      // not remain embedded for an hour at an edge cache.
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

export function renderPendingBadgeSvg(reason = "not analyzed") {
  return renderBadgeSvg("analysis pending", badgeTierColors.unanalyzed, reason);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
