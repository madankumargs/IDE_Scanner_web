import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import ExtensionIdentity from "@/app/ExtensionIdentity";
import DeepScanButton from "@/app/DeepScanButton";
import { decisionExplanation, decisionLabel } from "@/lib/dossierPresentation";
import { scanDecision } from "@/lib/extensionPageModel";
import { publicAnalysisAction } from "@/lib/publicAnalysisAction";
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
  const action = publicAnalysisAction({
    extensionId: extension.id,
    version,
    fullAnalysisHref,
    scanned,
    signedIn,
  });
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
      <section className="summaryBody">
        <div>
          <span className="kicker">What this means</span>
          <h1>
            {scanned
              ? "The key information before you install."
              : "Read the publisher details before you install."}
          </h1>
          <p>
            {scanned
              ? signedIn
                ? "Open the full analysis to inspect the evidence and make a workspace decision."
                : "This is a plain-language summary of the completed analysis for this exact extension version. Technical evidence and workspace actions are available after sign-in."
              : "Publisher documentation and release history are public. Request a Deep Scan when you need security evidence for this version."}
          </p>
        </div>
        <aside>
          {scanned ? (
            action.requiresSignIn ? (
              <Link className="button buttonDark" href={action.href}>
                {action.label}
                <ArrowRight size={16} />
              </Link>
            ) : (
              <a className="button buttonDark" href={action.href}>
                {action.label}
                <ShieldCheck size={16} />
              </a>
            )
          ) : (
            <DeepScanButton extensionId={extension.id} version={version} />
          )}
          <Link
            className="button buttonQuiet"
            href={`/extensions/${encodeURIComponent(extension.id)}`}
          >
            Read README and releases <FileText size={16} />
          </Link>
        </aside>
      </section>
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
