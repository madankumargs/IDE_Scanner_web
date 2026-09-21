import DossierSectionHead from "@/app/dossier/DossierSectionHead";
import { coveragePresentation } from "@/lib/classificationContract";
import type { ReportScan } from "@/lib/reportContract";

export default function CoverageSection({ scan }: { scan: ReportScan }) {
  const providers = objectMap(scan.provider_coverage);
  const coverage = object(scan.analysis_coverage);
  const inventory = object(scan.artifact_inventory);
  const presentation = coveragePresentation(scan);
  const declared = arrayLength(coverage.declared_entrypoints);
  const resolved = arrayLength(coverage.resolved_entrypoints);
  const executable = arrayLength(coverage.executable_candidates);
  const files = Number(inventory.file_count || arrayLength(inventory.files));
  return <>
    <DossierSectionHead eyebrow="Analysis boundary" title="What was actually assessed" detail="Coverage shows the artifact scope behind this report. It is not a claim that the extension is safe." />
    <div className="coverageGrid coverageExplained">
      <Fact label={presentation.label} value={`${presentation.percent}%`} detail={presentation.providerDetail} />
      <Fact label="Declared entrypoints" value={String(declared)} detail={declared ? "Declared by the extension manifest" : "No launch entrypoints were declared"} />
      <Fact label="Resolved entrypoints" value={String(resolved)} detail={resolved ? "Entrypoints found in this exact artifact" : "No declared entrypoint resolved to a file"} />
      <Fact label="Executable candidates" value={String(executable)} detail={executable ? "Files selected for executable analysis" : files ? "No executable candidate was recorded by this scanner" : "Artifact file inventory was not emitted"} />
    </div>
    <div className="providerGrid coverageProviders">{Object.entries(providers).map(([name, value]) => <article key={name}><span>{name.replaceAll("_", " ")}</span><strong>{String(value.status || "not assessed")}</strong><p>{Number(value.finding_count || 0)} normalized finding{Number(value.finding_count || 0) === 1 ? "" : "s"}</p></article>)}</div>
    {!Object.keys(providers).length ? <div className="coverageNoProviders">No analyzer-provider records were supplied with this report.</div> : null}
  </>;
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) { return <article><span>{label}</span><strong>{value}</strong>{detail ? <p>{detail}</p> : null}</article>; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function objectMap(value: unknown): Record<string, Record<string, unknown>> { return Object.fromEntries(Object.entries(object(value)).filter(([, item]) => Boolean(item) && typeof item === "object" && !Array.isArray(item))) as Record<string, Record<string, unknown>>; }
function arrayLength(value: unknown) { return Array.isArray(value) ? value.length : 0; }
