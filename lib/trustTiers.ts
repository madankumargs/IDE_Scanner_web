/**
 * Trust-tier vocabulary shared by public reports, inventory, and badges.
 *
 * Mirrors `ide-scanner/src/ide_scanner/trust_tiers.py`. GuardRails describes
 * what an extension does; it does not editorialize ("Do not install").
 * Enforcement decisions belong to team policy, not to public verdict labels.
 */

export type TrustTier = "verified" | "analyzed" | "attention" | "confirmed_risk" | "unanalyzed";

export type TrustTierTone = "allow" | "info" | "review" | "block" | "neutral";

export type TrustTierInput = {
  analysis_status?: unknown;
  decision?: unknown;
  public_outcome?: unknown;
  verdict?: unknown;
  capability_assessment?: unknown;
  analysis_coverage?: unknown;
};

export type TrustTierInfo = {
  tier: TrustTier;
  label: string;
  tone: TrustTierTone;
  summary: string;
};

export const TRUST_TIER_VERSION = "1.0.0";

const ANALYZED_LABEL = "Analyzed · capabilities documented";
const CONFIRMED_RISK_LABEL = "Confirmed risk";

export function deriveTrustTier(scan: TrustTierInput): TrustTierInfo {
  const decision = String(scan.decision || "incomplete");
  const verdict = String(scan.verdict || "");
  const analysisStatus = String(scan.analysis_status || "incomplete");
  if (decision === "incomplete" || decision === "failed" || (analysisStatus !== "complete" && analysisStatus !== "")) {
    return {
      tier: "unanalyzed",
      label: "Analysis pending",
      tone: "neutral",
      summary: "Analysis has not completed for this exact version.",
    };
  }

  if (verdict === "malicious") {
    return {
      tier: "confirmed_risk",
      label: CONFIRMED_RISK_LABEL,
      tone: "block",
      summary:
        "Authoritative threat evidence matched this exact artifact. See the linked evidence for the matching record.",
    };
  }

  const assessment = isRecord(scan.capability_assessment) ? scan.capability_assessment : {};
  const undeclared = Array.isArray(assessment.unexpected)
    ? assessment.unexpected.map(String).filter(Boolean)
    : [];
  const behavioralVerification = isRecord(assessment.behavioral_verification)
    ? assessment.behavioral_verification
    : null;
  const coverage = isRecord(scan.analysis_coverage) ? scan.analysis_coverage : {};
  const behaviorMatchesDeclaration =
    behavioralVerification?.status === "complete" &&
    behavioralVerification.matches_declaration === true;
  const coverageComplete = coverage.status === "complete";

  if (
    decision === "block" ||
    verdict === "suspicious" ||
    undeclared.length ||
    scan.public_outcome === "investigate" ||
    scan.public_outcome === "preventive_block"
  ) {
    if (undeclared.length) {
      const noun = undeclared.length === 1 ? "capability" : "capabilities";
      return {
        tier: "attention",
        label: `${undeclared.length} undeclared ${noun} detected`,
        tone: "review",
        summary:
          "Flagged behavior differs from the extension's declaration. Each flag links to the underlying evidence.",
      };
    }
    return {
      tier: "attention",
      label: "Needs attention · see findings",
      tone: "review",
      summary:
        "Flagged behavior differs from the extension's declaration. Each flag links to the underlying evidence.",
    };
  }

  if (behaviorMatchesDeclaration && coverageComplete && (decision === "allow" || decision === "review")) {
    return {
      tier: "verified",
      label: "Verified · behavior matches declaration",
      tone: "allow",
      summary: "Observed behavior matches the declared capabilities for this exact artifact.",
    };
  }

  return {
    tier: "analyzed",
    label: ANALYZED_LABEL,
    tone: "info",
    summary:
      "Analysis completed for this exact version. Capabilities are documented in the report.",
  };
}

/** Badge SVG text, kept short enough for shields-style rendering. */
export function trustBadgeText(info: TrustTierInfo, version?: string | null, riskScore?: number | null): string {
  const suffix = `${riskScore !== null && riskScore !== undefined && Number.isFinite(Number(riskScore)) ? ` · risk ${Math.max(0, Math.min(100, Number(riskScore)))}/100` : ""}${version ? ` · v${version}` : ""}`;
  switch (info.tier) {
    case "verified":
      return `verified${suffix}`;
    case "analyzed":
      return `analyzed${suffix}`;
    case "confirmed_risk":
      return `confirmed risk${suffix}`;
    case "attention":
      return `${info.label.toLowerCase()}${suffix}`;
    case "unanalyzed":
      return "analysis pending";
    default:
      return `${info.label.toLowerCase()}${suffix}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
