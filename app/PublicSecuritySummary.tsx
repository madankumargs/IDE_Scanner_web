import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ExtensionIdentity from "@/app/ExtensionIdentity";
import PublicAnalysisCallout from "@/app/PublicAnalysisCallout";
import { decisionExplanation, decisionLabel } from "@/lib/dossierPresentation";
import { scanDecision } from "@/lib/extensionPageModel";
import type { CatalogExtension } from "@/lib/productData";
import PermissionPassport from "@/app/extensions/PermissionPassport";
import { buildPermissionPassport } from "@/lib/permissionPassport";
import type { ReportProof } from "@/lib/reportProofPresentation";

type Props = {
  extension: CatalogExtension;
  version: string;
  versions: Array<Record<string, unknown>>;
  scan: Record<string, unknown> | null;
  fullAnalysisHref?: string;
  signedIn: boolean;
  proof?: ReportProof;
};

export default function PublicSecuritySummary({
  extension,
  version,
  versions,
  scan,
  fullAnalysisHref,
  signedIn,
  proof,
}: Props) {
  const decision = scanDecision(scan?.decision);
  const scanned = Boolean(scan?.id) && decision !== "not-scanned";
  const headline = scanned ? decisionLabel(decision) : "Not analyzed yet";
  const reason = scanned
    ? String(scan?.decision_reason || decisionExplanation(decision))
    : "No completed security analysis exists for this exact version. This is not a safety verdict.";
  return (
    <main className="securitySummary">
      <Link
        className="dossierBack"
        href={`/extensions/${encodeURIComponent(extension.id)}`}
      >
        Back to extension profile
      </Link>
      <header className="summaryMast">
        <ExtensionIdentity
          size="lg"
          eyebrow="Extension Security Summary"
          id={extension.id}
          version={version}
          name={extension.display_name}
          iconUrl={extension.icon_url}
          publisher={extension.publisher}
          verified={extension.publisher_verified}
        />
        <div className={`summaryOutcome ${decision}`}>
          <span>Can I install this release?</span>
          <strong>{headline}</strong>
          <p>{reason}</p>
        </div>
      </header>
      <section className="summaryProof">
        <article>
          <span>Checked version</span>
          <strong>{version}</strong>
        </article>
        <article>
          <span>Analysis status</span>
          <strong>{scanned ? "Completed" : "Not available"}</strong>
        </article>
        <article>
          <span>Scan date</span>
          <strong>
            {scanned && (scan?.created_at || scan?.scanned_at)
              ? new Date(String(scan.created_at || scan.scanned_at)).toLocaleDateString()
              : "—"}
          </strong>
        </article>
      </section>
      <section className="summaryQuestions" aria-label="Installation guidance">
        <article>
          <span>Why this result?</span>
          <strong>{reason}</strong>
        </article>
        <article>
          <span>What should I do next?</span>
          <strong>{nextStep(decision, scanned)}</strong>
        </article>
      </section>
      {proof ? <EvidenceBasis proof={proof} /> : null}
      <PublicAnalysisCallout
        extensionId={extension.id}
        version={version}
        scanned={scanned}
        fullAnalysisHref={fullAnalysisHref}
        initialSignedIn={signedIn}
        scanSupported={extension.scan_supported}
        scanSupportReason={extension.scan_support_reason}
      />
      <PermissionPassport
        compact
        passport={buildPermissionPassport({
          extensionId: extension.id,
          version,
          latestVersion: String(
            versions.find((item) => item.is_latest)?.version ||
              versions[0]?.version ||
              version,
          ),
          scan,
        })}
        reportHref={fullAnalysisHref}
      />
      <section className="summaryVersions">
        <span className="kicker">Release context</span>
        <h2>Versions</h2>
        {versions.slice(0, 6).map((item) => (
          <Link
            key={String(item.version)}
            href={`/extensions/${encodeURIComponent(extension.id)}/versions/${encodeURIComponent(String(item.version))}`}
          >
            <strong>{String(item.version)}</strong>
            <span>
              {scanDecision(item.decision) === "not-scanned"
                ? "Not analyzed"
                : decisionLabel(scanDecision(item.decision))}
            </span>
            <ArrowRight size={15} />
          </Link>
        ))}
      </section>
    </main>
  );
}

function EvidenceBasis({ proof }: { proof: ReportProof }) {
  return (
    <section className="summaryEvidence" aria-labelledby="summary-evidence-title">
      <div className="summaryEvidenceIntro">
        <span className="kicker">Evidence behind this result</span>
        <h2 id="summary-evidence-title">Recorded proof for this exact release</h2>
        <p>These values support the decision above. They describe the scanned artifact only and do not establish publisher-wide safety.</p>
      </div>
      <dl>
        <div><dt>Artifact identity</dt><dd>{proof.artifactSha256Recorded ? "SHA-256 recorded" : "Not recorded"}</dd></div>
        <div><dt>Scan source</dt><dd>{proof.source}</dd></div>
        <div><dt>Actionable evidence</dt><dd>{proof.actionable == null ? "Not included in summary" : `${proof.actionable} ${proof.actionable === 1 ? "group" : "groups"}`}</dd></div>
        <div><dt>Contextual evidence</dt><dd>{proof.contextual == null ? "Not included in summary" : `${proof.contextual} ${proof.contextual === 1 ? "group" : "groups"}`}</dd></div>
        <div><dt>Recorded observations</dt><dd>{proof.observations == null ? "Not recorded" : `${proof.observations} ${proof.observations === 1 ? "observation" : "observations"}`}</dd></div>
        <div><dt>Access signals</dt><dd>{proof.capabilities == null ? "Not recorded" : `${proof.capabilities} recorded ${proof.capabilities === 1 ? "capability" : "capabilities"}`}</dd></div>
        <div><dt>Detailed inventory</dt><dd>{inventoryCopy(proof)}</dd></div>
      </dl>
    </section>
  );
}

function inventoryCopy(proof: ReportProof) {
  const files = proof.files == null ? "Files not recorded" : `${proof.files} ${proof.files === 1 ? "file" : "files"}`;
  const dependencies = proof.dependencies == null ? "Dependencies not recorded" : `${proof.dependencies} ${proof.dependencies === 1 ? "dependency" : "dependencies"}`;
  return proof.detailAvailable ? `${files} · ${dependencies}` : `${files} · ${dependencies} · detailed list after sign-in`;
}

function nextStep(decision: string, scanned: boolean) {
  if (!scanned) return "Request a Deep Scan for this exact version to obtain a decision and supporting evidence.";
  if (decision === "block") return "Do not install this release. Review the supporting evidence and choose a different version.";
  if (decision === "review") return "Inspect the review findings and file locations, then record a team decision before approval.";
  if (decision === "allow") return "Approval can proceed under your organization’s normal extension controls.";
  return "Wait for a completed analysis before treating this release as approved.";
}
