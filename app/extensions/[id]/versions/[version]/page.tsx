import { notFound } from "next/navigation";
import PublicSecuritySummary from "@/app/PublicSecuritySummary";
import { getExtensionProduct, getVersionProduct } from "@/lib/productData";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { cloudflareSessionActive } from "@/lib/cloudflareSession";
import { serverDb } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function VersionPage({ params }: { params: Promise<{ id: string; version: string }> }) {
  const route = await params;
  const id = decodeURIComponent(route.id);
  const version = decodeURIComponent(route.version);
  const cloudflare = cloudflarePrivateAvailable();
  const [signedIn, extensionProduct, versionProduct] = await Promise.all([
    cloudflare ? cloudflareSessionActive() : serverDb().then((db) => db.auth.getClaims().then((result) => Boolean(result.data?.claims))).catch(() => false),
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
  return <PublicSecuritySummary extension={extensionProduct.extension} version={version} versions={versions} scan={scan || null} fullAnalysisHref={fullAnalysisHref} signedIn={signedIn}/>;
}
