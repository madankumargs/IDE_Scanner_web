"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  FileText,
  Fingerprint,
  FolderTree,
  GitCompareArrows,
  LockKeyhole,
  Package,
  Radar,
  ShieldCheck,
  Terminal,
  UserRound,
  Waypoints,
} from "lucide-react";
import DossierHeader from "@/app/dossier/DossierHeader";
import DossierNavigation from "@/app/dossier/DossierNavigation";
import DependenciesSection from "@/app/dossier/DependenciesSection";
import CapabilitiesSection, {
  normalizeCapabilities,
} from "@/app/dossier/CapabilitiesSection";
import FilesSection from "@/app/dossier/FilesSection";
import PublisherSection from "@/app/dossier/PublisherSection";
import VersionsSection from "@/app/dossier/VersionsSection";
import CoverageSection from "@/app/dossier/CoverageSection";
import ReadmeSection from "@/app/dossier/ReadmeSection";
import ProvenanceSection from "@/app/dossier/ProvenanceSection";
import RawEvidenceSection from "@/app/dossier/RawEvidenceSection";
import AlertsSection from "@/app/dossier/AlertsSection";
import ChangesSection from "@/app/dossier/ChangesSection";
import OverviewSection from "@/app/dossier/OverviewSection";
import EvidenceIntelligenceReport from "@/app/EvidenceIntelligenceReport";
import { benchmarkValidation } from "@/lib/benchmarkLookup";
import {
  coveragePresentation,
  displayedDecision,
  requiresReview,
} from "@/lib/classificationContract";
import type {
  ExtensionDossierData,
  ReportFinding,
  ReportObject,
} from "@/lib/reportContract";
import immutableStyles from "@/app/dossier/immutableReport.module.css";
import reportStyles from "@/app/dossier/reportShell.module.css";

type Section =
  | "overview"
  | "readme"
  | "changes"
  | "alerts"
  | "capabilities"
  | "dependencies"
  | "files"
  | "versions"
  | "publisher"
  | "provenance"
  | "coverage"
  | "raw";
type Props = { data: ExtensionDossierData };

const sections: Array<{ id: Section; label: string; icon: typeof Radar }> = [
  { id: "overview", label: "Overview", icon: Radar },
  { id: "readme", label: "README", icon: FileText },
  { id: "changes", label: "What changed", icon: GitCompareArrows },
  { id: "alerts", label: "Evidence", icon: AlertTriangle },
  { id: "capabilities", label: "Capabilities", icon: Waypoints },
  { id: "dependencies", label: "Dependencies", icon: Package },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "versions", label: "Versions", icon: GitCompareArrows },
  { id: "publisher", label: "Publisher", icon: UserRound },
  { id: "provenance", label: "Provenance", icon: Fingerprint },
  { id: "coverage", label: "Coverage", icon: ShieldCheck },
  { id: "raw", label: "Raw evidence", icon: Terminal },
];

export default function AnalysisReport({ data, signedIn = false }: Props & { signedIn?: boolean }) {
  const {
    id,
    version,
    extension,
    versions,
    scan,
    findings,
    files,
    dependencies,
  } = data;
  const [active, setActive] = useState<Section>("overview");
  const decision = displayedDecision(scan);
  const capabilities = normalizeCapabilities(scan.capabilities);
  const grouped = useMemo(() => groupFindings(findings), [findings]);
  const actionableGroups = grouped.filter((group) =>
    requiresReview(group.actionability),
  );
  const lowGroups = grouped.filter((group) => group.actionability === "low");
  const contextualGroups = grouped.filter(
    (group) => group.actionability === "contextual",
  );
  const validation =
    scan.scan_purpose === "benchmark"
      ? benchmarkValidation(id, version, String(scan.artifact_sha256 || ""))
      : null;
  const coverage = coveragePresentation(scan);
  const badgeCount = (section: Section) =>
    section === "alerts"
      ? actionableGroups.length + lowGroups.length
      : section === "capabilities"
        ? Object.keys(capabilities).length
        : section === "dependencies"
          ? dependencies.length
          : section === "files"
            ? files.length
            : section === "versions"
              ? versions.length
              : 0;
  useEffect(() => {
    const selectHash = () => {
      const section = window.location.hash.slice(1) as Section;
      if (sections.some((item) => item.id === section)) setActive(section);
    };
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, []);
  return (
    <main className={`dossierPage ${reportStyles.shell}`}>
      <Link
        className={`dossierBack ${reportStyles.back}`}
        href={`/extensions/${encodeURIComponent(id)}`}
      >
        Back to extension profile
      </Link>
      <section
        className={immutableStyles.immutableBar}
        aria-label="Immutable report identity"
      >
        <span className={immutableStyles.lock}>
          <LockKeyhole aria-hidden="true" />
        </span>
        <div>
          <span>Immutable Deep Scan report</span>
          <strong>Evidence is locked to this exact artifact and scan.</strong>
          <details><summary>About immutable reports</summary><p>Future scans cannot replace the findings, coverage, ruleset, or artifact hash shown on this URL.</p></details>
        </div>
        <dl>
          <div>
            <dt>Scan</dt>
            <dd>
              <code>{String(scan.id || "Not reported")}</code>
            </dd>
          </div>
          <div>
            <dt>Artifact</dt>
            <dd>
              <code>
                {shortHash(String(scan.artifact_sha256 || "Not reported"))}
              </code>
            </dd>
          </div>
        </dl>
      </section>
      <div className={reportStyles.mast}><DossierHeader
          id={id}
          version={version}
          extension={extension}
          scan={scan}
        /></div>
      <section className={reportStyles.pulse} aria-label="Report evidence snapshot">
        <article><span>Decision now</span><strong>{String(scan.decision_reason || "Evidence is scoped to this exact release.")}</strong><small>Exact artifact only</small></article>
        <article><span>Actionable evidence</span><strong>{actionableGroups.length}</strong><small>{lowGroups.length + contextualGroups.length} contextual notes</small></article>
        <article><span>Capabilities</span><strong>{Object.keys(capabilities).length}</strong><small>Observed powers, not intent</small></article>
        <article><span>Coverage</span><strong>{coverage.percent}%</strong><small>{coverage.label}</small></article>
        <article><span>Package scope</span><strong>{files.length}</strong><small>{dependencies.length} dependencies</small></article>
      </section>
      {validation ? (
        <Link className="dossierValidated" href="/benchmark">
          <span className="dossierValidatedMark">
            <BadgeCheck aria-hidden="true" />
          </span>
          <div>
            <span>Frozen regression fixture</span>
            <strong>
              This exact artifact is in the GuardRails regression corpus.
            </strong>
            <p>
              Hash-pinned as a {validation.classification.replaceAll("-", " ")}{" "}
              case. The exact artifact identity matches the frozen cohort; the
              current decision above comes only from this scan&apos;s evidence.
            </p>
          </div>
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : null}
      <div className={`dossierMeta ${reportStyles.meta}`}>
        <span>{String(extension.publisher || "Not reported")}</span>
        <span>{String(extension.registry || "Registry not reported")}</span>
        <span>Version {version}</span>
      </div>
      <EvidenceIntelligenceReport
        extensionId={id}
        version={version}
        scanId={String(scan.id || "")}
        signedIn={signedIn}
      />
      <div className={`dossierLayout ${reportStyles.layout}`}>
        <DossierNavigation
          items={sections}
          active={active}
          count={badgeCount}
          onSelect={setActive}
        />
        <section className="dossierContent">
          {active === "overview" ? (
            <OverviewSection
              decision={decision}
              scan={scan}
              actionableGroups={actionableGroups}
              noteGroups={[...lowGroups, ...contextualGroups]}
              capabilities={capabilities}
              onOpenAlerts={() => {
                setActive("alerts");
                window.history.pushState(null, "", "#alerts");
              }}
            />
          ) : null}
          {active === "readme" ? (
            <ReadmeSection
              id={id}
              version={version}
              scanId={String(scan.id || "")}
              files={files}
            />
          ) : null}
          {active === "changes" ? (
            <ChangesSection id={id} current={version} versions={versions} />
          ) : null}
          {active === "alerts" ? (
            <AlertsSection
              actionableGroups={actionableGroups}
              lowGroups={lowGroups}
              contextualGroups={contextualGroups}
            />
          ) : null}
          {active === "capabilities" ? (
            <CapabilitiesSection capabilities={capabilities} />
          ) : null}
          {active === "dependencies" ? (
            <DependenciesSection dependencies={dependencies} />
          ) : null}
          {active === "files" ? (
            <FilesSection
              id={id}
              version={version}
              scanId={String(scan.id || "")}
              files={files}
            />
          ) : null}
          {active === "versions" ? (
            <VersionsSection versions={versions} current={version} />
          ) : null}
          {active === "publisher" ? (
            <PublisherSection extension={extension} files={files} />
          ) : null}
          {active === "provenance" ? <ProvenanceSection scan={scan} /> : null}
          {active === "coverage" ? <CoverageSection scan={scan} /> : null}
          {active === "raw" ? (
            <RawEvidenceSection scan={scan} findings={findings} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function shortHash(value: string) {
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

type Group = {
  rule: string;
  summary: string;
  severity: string;
  count: number;
  locations: string[];
  actionability: string;
  evidenceClasses: string[];
};
function groupFindings(findings: ReportFinding[]): Group[] {
  const groups = new Map<string, Group>();
  for (const item of findings) {
    const rule = String(item.rule_id || "observed-capability");
    const current = groups.get(rule);
    const findingSeverity = normalizedSeverity(
      String(item.effective_severity || item.severity || "INFO"),
    );
    const actionability = String(item.actionability || "contextual");
    const evidenceClass = String(
      item.evidence_class ||
        (item.evidence as ReportObject | undefined)?.evidence_class ||
        "weak",
    );
    const locations = Array.isArray(item.file_refs)
      ? item.file_refs.map(String)
      : [];
    if (current) {
      current.count += 1;
      current.severity =
        severityRank(findingSeverity) > severityRank(current.severity)
          ? findingSeverity
          : current.severity;
      current.actionability =
        actionabilityRank(actionability) >
        actionabilityRank(current.actionability)
          ? actionability
          : current.actionability;
      for (const location of locations)
        if (!current.locations.includes(location))
          current.locations.push(location);
      if (!current.evidenceClasses.includes(evidenceClass))
        current.evidenceClasses.push(evidenceClass);
    } else
      groups.set(rule, {
        rule,
        summary: String(
          item.summary || item.evidence_summary || rule.replaceAll("-", " "),
        ),
        severity: findingSeverity,
        count: 1,
        locations,
        actionability,
        evidenceClasses: [evidenceClass],
      });
  }
  return [...groups.values()].sort(
    (a, b) =>
      actionabilityRank(b.actionability) - actionabilityRank(a.actionability) ||
      severityRank(b.severity) - severityRank(a.severity) ||
      b.count - a.count,
  );
}
function normalizedSeverity(value: string) {
  return ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(
    value.toUpperCase(),
  )
    ? value.toUpperCase()
    : "INFO";
}
function severityRank(value: string) {
  return (
    (
      { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 } as Record<
        string,
        number
      >
    )[value] || 0
  );
}
function actionabilityRank(value: string) {
  return (
    (
      { block: 5, investigate: 4, review: 3, low: 2, contextual: 1 } as Record<
        string,
        number
      >
    )[value] || 1
  );
}
