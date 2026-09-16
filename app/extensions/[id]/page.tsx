import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronRight, Download } from "lucide-react";
import {
  getExtensionProduct,
  getPublicInventory,
  getVersionProduct,
} from "@/lib/productData";
import { rankRelatedExtensions } from "@/lib/relatedExtensions";
import alternativesStyles from "@/app/extensions/alternatives.module.css";
import DeepScanButton from "@/app/DeepScanButton";
import WatchExtension from "@/app/WatchExtension";
import ExtensionIcon from "@/app/ExtensionIcon";
import ProfileReadme from "@/app/ProfileReadme";
import ReleaseTimeline from "@/app/extensions/ReleaseTimeline";
import PermissionPassport from "@/app/extensions/PermissionPassport";
import PermissionDiffCard from "@/app/extensions/PermissionDiffCard";
import { buildPermissionPassport } from "@/lib/permissionPassport";
import type { ReportFile } from "@/lib/reportContract";
import { extensionPageModel, scanDecision } from "@/lib/extensionPageModel";

// Public extension profiles are safe to serve from ISR. User-specific scan
// actions and reports remain behind their own authenticated API/page routes.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getExtensionProduct(decodeURIComponent(id));
  if (!product) return { title: "Extension not found" };
  const name = product.extension.display_name || product.extension.id;
  const publisher = product.extension.publisher;
  return {
    title: `${name} (${publisher}) — safety check`,
    description: `See what the ${name} VS Code extension can access before you install it: permissions, capabilities, and changes between releases, analyzed by GuardRails.`,
    alternates: { canonical: `/extensions/${product.extension.id}` },
  };
}

export default async function ExtensionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getExtensionProduct(decodeURIComponent(id));
  if (!product) notFound();
  const latest =
    product.versions.find((item) => item.is_latest) || product.versions[0];
  const version = String(
    latest?.version || product.extension.latest_version || "unknown",
  );
  const versionProduct =
    version === "unknown"
      ? null
      : await getVersionProduct(product.extension.id, version);
  const scan =
    (versionProduct?.scan as Record<string, unknown> | null | undefined) ||
    product.scan;
  const files = (versionProduct?.files || []) as ReportFile[];
  const pageModel = extensionPageModel(product.extension.id, version, scan);
  const decision = pageModel.decision;
  const reportHref = pageModel.reportHref;
  const inventory = await getPublicInventory().catch(() => null);
  const alternatives = inventory
    ? rankRelatedExtensions(
        {
          extension_id: product.extension.id,
          display_name: product.extension.display_name,
          description: product.extension.description,
          publisher: product.extension.publisher,
          decision,
          severity: scan ? String(scan.severity || "") : undefined,
        },
        inventory.items,
      )
    : [];
  const publisherReadmeHref =
    product.extension.registry === "openvsx"
      ? `https://open-vsx.org/extension/${encodeURIComponent(product.extension.publisher)}/${encodeURIComponent(product.extension.name)}`
      : `https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(product.extension.id)}`;
  return (
    <main className="extensionProfile">
      <header className="profileHeader">
        <div className="profileIdentity">
          <ExtensionIcon
            iconUrl={product.extension.icon_url}
            publisher={product.extension.publisher}
            name={product.extension.display_name}
            size="lg"
          />
          <div>
            <span>
              {product.extension.registry === "openvsx"
                ? "Open VSX"
                : "VS Marketplace"}
            </span>
            <h1>{product.extension.display_name}</h1>
            <code>{product.extension.id}</code>
            <p>{product.extension.description}</p>
          </div>
        </div>
        <div className="profileActions">
          {scan ? (
            <Link className="button buttonDark" href={reportHref}>
              Read Analysis Report
            </Link>
          ) : (
            <DeepScanButton
              extensionId={product.extension.id}
              version={version}
            />
          )}
          <a
            className="button buttonQuiet"
            href={`vscode:extension/${product.extension.id}`}
          >
            Install <Download size={16} />
          </a>
        </div>
      </header>
      <div className="profileFacts">
        <span>
          Publisher{" "}
          <strong>
            {product.extension.publisher}
            {product.extension.publisher_verified ? (
              <BadgeCheck size={15} />
            ) : null}
          </strong>
        </span>
        <span>
          Installs <strong>{formatCount(product.extension.installs)}</strong>
        </span>
        <span>
          Latest version <strong>{version}</strong>
        </span>
      </div>
      <div className="profileLayout">
        <div>
          <section id="overview" className="profileSection">
            <header>
              <span>Current release</span>
              <h2>
                {scan
                  ? decisionHeadline(decision)
                  : "This version has not been scanned yet."}
              </h2>
            </header>
            <p>
              {scan
                ? String(
                    scan.decision_reason ||
                      "Review the Analysis Report before installing.",
                  )
                : "Read the README and version history, then request a security scan when you are ready."}
            </p>
            {scan ? (
              <Link className="profileReportLink" href={reportHref}>
                Read Analysis Report <ChevronRight size={16} />
              </Link>
            ) : null}
          </section>
          <PermissionPassport
            passport={buildPermissionPassport({
              extensionId: product.extension.id,
              version,
              latestVersion: version,
              scan,
            })}
            reportHref={scan ? reportHref : undefined}
          />
          <PermissionDiffCard
            extensionId={product.extension.id}
            currentVersion={version}
            versions={product.versions}
          />
          <ReleaseTimeline
            extensionId={product.extension.id}
            releases={product.versions}
          />
          <ProfileReadme
            extensionId={product.extension.id}
            version={version}
            scanId={String(scan?.id || "")}
            files={files}
            documentationUrl={publisherReadmeHref}
          />
          <section id="versions" className="profileSection">
            <header>
              <span>Versions</span>
              <h2>Release history</h2>
            </header>
            <div className="versionTable">
              <div className="versionHead">
                <span>Version</span>
                <span>Scan status</span>
                <span />
              </div>
              {product.versions.map((item) => {
                const versionDecision = decisionState(item.decision);
                const itemVersion = String(item.version);
                return (
                  <div className="versionRow" key={itemVersion}>
                    <strong>{itemVersion}</strong>
                    <span
                      className={`scanState decisionState ${versionDecision}`}
                    >
                      {versionDecision === "not-scanned"
                        ? "NOT SCANNED"
                        : decisionLabel(versionDecision)}
                    </span>
                    <Link
                      href={`/extensions/${encodeURIComponent(product.extension.id)}/versions/${encodeURIComponent(itemVersion)}`}
                    >
                      {versionDecision === "not-scanned"
                        ? "View version"
                        : "View report"}{" "}
                      <ChevronRight size={15} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
          {alternatives.length ? (
            <section
              id="alternatives"
              className={`profileSection ${alternativesStyles.alternatives}`}
            >
              <header>
                <span>Reputable alternatives</span>
                <h2>Safer picks for the same job</h2>
              </header>
              <p className={alternativesStyles.explainer}>
                Similar extensions with a completed analysis and a cleaner
                verdict, when they exist.
              </p>
              <div className={alternativesStyles.grid}>
                {alternatives.map((item) => {
                  const itemDecision = decisionState(item.decision);
                  return (
                    <Link
                      className={alternativesStyles.card}
                      href={`/extensions/${encodeURIComponent(item.extension_id)}`}
                      key={item.extension_id}
                    >
                      <ExtensionIcon
                        iconUrl={item.icon_url}
                        publisher={item.publisher}
                        name={item.display_name}
                      />
                      <span className={alternativesStyles.cardBody}>
                        <strong>{item.display_name}</strong>
                        <span className={alternativesStyles.publisher}>
                          {item.publisher}
                          {item.publisher_verified ? (
                            <BadgeCheck size={13} />
                          ) : null}
                        </span>
                        <span
                          className={`scanState decisionState ${itemDecision}`}
                        >
                          {decisionLabel(itemDecision)}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="profileAside">
          <div>
            <span>Package</span>
            <dl>
              <dt>Registry</dt>
              <dd>
                {product.extension.registry === "openvsx"
                  ? "Open VSX"
                  : "VS Marketplace"}
              </dd>
              <dt>Rating</dt>
              <dd>{product.extension.rating || "Not reported"}</dd>
              <dt>Repository</dt>
              <dd>
                {product.extension.repository_url ? (
                  <a href={product.extension.repository_url}>Open source</a>
                ) : (
                  "Not declared"
                )}
              </dd>
            </dl>
          </div>
          <div>
            <span>Watch releases</span>
            <p>Get a reminder when this extension publishes a new version.</p>
            <WatchExtension extensionId={product.extension.id} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function decisionState(value: unknown) {
  return scanDecision(value);
}
function decisionLabel(value: ReturnType<typeof decisionState>): string {
  return value === "allow"
    ? "ANALYZED"
    : value === "review"
      ? "ATTENTION"
      : value === "block"
        ? "FLAGGED BY POLICY"
        : value === "incomplete"
          ? "ANALYSIS PENDING"
          : "NOT SCANNED";
}
function decisionHeadline(value: ReturnType<typeof decisionState>): string {
  return value === "allow"
    ? "Analysis completed; capabilities are documented below."
    : value === "review"
      ? "Flagged behavior needs context before installing."
      : value === "block"
        ? "Team policy must resolve the flagged evidence for this version."
        : value === "incomplete"
          ? "The scan needs to finish."
          : "This version has not been scanned yet.";
}
function formatCount(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
