import { notFound } from "next/navigation";
import PublicSecuritySummary from "@/app/PublicSecuritySummary";
import { getExtensionProduct, getVersionProduct } from "@/lib/productData";

// This is a public, exact-release summary. Keep it on ISR so a burst of
// visitors does not make every request repeat the D1 and registry work.
export const revalidate = 300;

export default async function VersionPage({ params }: { params: Promise<{ id: string; version: string }> }) {
  const route = await params;
  const id = decodeURIComponent(route.id);
  const version = decodeURIComponent(route.version);
  const [extensionProduct, versionProduct] = await Promise.all([
    getExtensionProduct(id),
    getVersionProduct(id, version),
  ]);
  if (!extensionProduct) notFound();
  const scan = versionProduct?.scan as Record<string, unknown> | null | undefined;
  const scanId = scan?.id ? String(scan.id) : "";
  const fullAnalysisHref = scanId ? `/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/scans/${encodeURIComponent(scanId)}` : undefined;
  const versions = scan
    ? extensionProduct.versions.map((item) => String(item.version || "") === version
      ? { ...item, latest_scan_id: scan.id, scan_state: scan.analysis_status, decision: scan.decision, coverage_percent: scan.coverage_percent, scanned_at: scan.scanned_at || scan.created_at }
      : item)
    : extensionProduct.versions;
  // Authentication is intentionally resolved by the full-analysis route. A
  // public summary must remain cacheable and must not vary its HTML by a
  // session cookie.
  return <PublicSecuritySummary extension={extensionProduct.extension} version={version} versions={versions} scan={scan || null} fullAnalysisHref={fullAnalysisHref} signedIn={false}/>;
}
