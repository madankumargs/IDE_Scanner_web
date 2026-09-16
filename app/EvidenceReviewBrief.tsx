import Link from "next/link";
import { ArrowRight, BrainCircuit } from "lucide-react";
import styles from "./evidenceReviewBrief.module.css";

/**
 * Compatibility shell for callers that still import the retired brief surface.
 * Generation belongs to EvidenceIntelligenceReport, which has the signed
 * context ticket and the validated reviewer-guide contract.
 */
export default function EvidenceReviewBrief({
  extensionId,
  version,
  scanId,
}: {
  extensionId: string;
  version: string;
  scanId: string;
}) {
  const href = `/extensions/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}/scans/${encodeURIComponent(scanId)}#intelligence`;
  return (
    <section className={styles.card} aria-labelledby="evidence-brief-heading">
      <div className={styles.header}>
        <div className={styles.icon} aria-hidden="true">
          <BrainCircuit />
        </div>
        <div>
          <span className={styles.eyebrow}>Reviewer guide</span>
          <h2 id="evidence-brief-heading">
            Open the cited guide for this exact release.
          </h2>
          <p>
            The former free-form brief has been replaced by a validated guide
            with one takeaway, release-specific evidence, next actions, and
            explicit unknowns.
          </p>
        </div>
      </div>
      <div className={styles.signIn}>
        <p>
          <strong>Use the reviewer-guide surface.</strong> It keeps the
          deterministic decision authoritative and only shows provider text
          after the evidence references have been checked.
        </p>
        <Link href={href}>
          Open reviewer guide <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
