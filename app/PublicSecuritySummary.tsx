import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ExtensionIdentity from "@/app/ExtensionIdentity";
import PublicAnalysisCallout from "@/app/PublicAnalysisCallout";
import { decisionExplanation, decisionLabel } from "@/lib/dossierPresentation";
import { scanDecision } from "@/lib/extensionPageModel";
import type { CatalogExtension } from "@/lib/productData";
import PermissionPassport from "@/app/extensions/PermissionPassport";
import { buildPermissionPassport } from "@/lib/permissionPassport";

type Props = {
  extension: CatalogExtension;
  version: string;
  versions: Array<Record<string, unknown>>;
  scan: Record<string, unknown> | null;
  fullAnalysisHref?: string;
  signedIn: boolean;
};

export default function PublicSecuritySummary({
  extension,
  version,
  versions,
  scan,
  fullAnalysisHref,
  signedIn,
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
          <span>Security outcome</span>
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
      <PublicAnalysisCallout
        extensionId={extension.id}
        version={version}
        scanned={scanned}
        fullAnalysisHref={fullAnalysisHref}
        initialSignedIn={signedIn}
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
