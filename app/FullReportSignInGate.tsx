import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import ExtensionIdentity from "@/app/ExtensionIdentity";
import { decisionExplanation, decisionLabel } from "@/lib/dossierPresentation";
import { scanDecision } from "@/lib/extensionPageModel";
import type { CatalogExtension } from "@/lib/productData";
import type { ReportProof } from "@/lib/reportProofPresentation";
import styles from "./fullReportSignInGate.module.css";

export default function FullReportSignInGate({
  extension,
  version,
  scan,
  proof,
  returnHref,
}: {
  extension: CatalogExtension;
  version: string;
  scan: Record<string, unknown>;
  proof: ReportProof;
  returnHref: string;
}) {
  const decision = scanDecision(scan.decision);
  const accountHref = `/account?next=${encodeURIComponent(returnHref)}`;
  const headline = decisionLabel(decision);
  const reason = String(scan.decision_reason || decisionExplanation(decision));
  return (
    <main className={styles.page}>
      <Link className="dossierBack" href={`/extensions/${encodeURIComponent(extension.id)}/versions/${encodeURIComponent(version)}`}>
        Back to Quick Report
      </Link>
      <section className={styles.identity}>
        <ExtensionIdentity
          size="lg"
          eyebrow="Full Security Report"
          id={extension.id}
          version={version}
          name={extension.display_name}
          iconUrl={extension.icon_url}
          publisher={extension.publisher}
          verified={extension.publisher_verified}
        />
        <div className={styles.locked}><LockKeyhole aria-hidden="true" /><span>Technical evidence is available after sign-in.</span></div>
      </section>
      <section className={`${styles.decision} ${styles[decision]}`}>
        <span>Can I install this release?</span>
        <h1>{headline}</h1>
        <p>{reason}</p>
      </section>
      <section className={styles.questions} aria-label="Full report access">
        <div><span>Why this result?</span><strong>{reason}</strong></div>
        <div><span>What will the full report add?</span><strong>Findings, coverage, exact file locations, dependencies, release comparison, and monitoring.</strong></div>
      </section>
      <section className={styles.proof}>
        <div>
          <span>Evidence preview</span>
          <h2>Continue with the same exact-release decision.</h2>
          <p>Signing in unlocks the detailed report without changing the decision or introducing a second result.</p>
        </div>
        <dl>
          <div><dt>Scan source</dt><dd>{proof.source}</dd></div>
          <div><dt>Observations</dt><dd>{proof.observations == null ? "Not recorded" : proof.observations}</dd></div>
          <div><dt>Capabilities</dt><dd>{proof.capabilities == null ? "Not recorded" : proof.capabilities}</dd></div>
          <div><dt>Inventory</dt><dd>{proof.files == null ? "Not recorded" : `${proof.files} files`} · {proof.dependencies == null ? "dependencies not recorded" : `${proof.dependencies} dependencies`}</dd></div>
        </dl>
      </section>
      <div className={styles.actions}>
        <Link className="button buttonDark" href={accountHref}>Sign in to continue <ArrowRight size={16} /></Link>
        <Link className="button buttonQuiet" href={`/extensions/${encodeURIComponent(extension.id)}/versions/${encodeURIComponent(version)}`}>Return to Quick Report</Link>
      </div>
    </main>
  );
}
