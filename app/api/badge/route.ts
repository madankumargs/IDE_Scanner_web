import { getBadgeDecision, getVersionBadgeDecision } from "@/lib/productData";
import { deriveTrustTier, trustBadgeText } from "@/lib/trustTiers";

export const dynamic = "force-dynamic";

const TIER_COLORS: Record<string, string> = {
  verified: "#2fa96c",
  analyzed: "#31708f",
  attention: "#d99a1f",
  confirmed_risk: "#b32232",
  unanalyzed: "#6b7783",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const extension = (url.searchParams.get("extension") || "").trim();
  const version = (url.searchParams.get("version") || "").trim() || null;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(extension)) {
    return svg("analysis pending", TIER_COLORS.unanalyzed, "not analyzed");
  }
  let decision;
  try {
    decision = version ? await getVersionBadgeDecision(extension, version) : await getBadgeDecision(extension);
  } catch {
    return svg("analysis pending", TIER_COLORS.unanalyzed, "unavailable");
  }
  if (!decision.found || !decision.decision) {
    return svg("analysis pending", TIER_COLORS.unanalyzed, decision.extension_id ? "no completed analysis" : "not analyzed");
  }
  return tierSvg(decision);
}

function tierSvg(decision: Awaited<ReturnType<typeof getBadgeDecision>>) {
  const info = deriveTrustTier(decision);
  const color = TIER_COLORS[info.tier] || TIER_COLORS.analyzed;
  return svg(trustBadgeText(info, decision.version, decision.risk_score), color, `${info.label} (${decision.version || "latest"})`);
}

function svg(label: string, fill: string, ariaLabel: string) {
  const font = 'font-family="Verdana,Geneva,sans-serif" font-size="11" font-weight="600"';
  const leftWidth = 86;
  const rightWidth = Math.min(Math.max(7 + label.length * 6.2, 40), 300);
  const width = leftWidth + rightWidth;
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="guardrails: ${escapeXml(ariaLabel)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${leftWidth}" height="20" fill="#17212c"/>
<rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${fill}"/>
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
      "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
