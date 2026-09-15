import { notFound } from "next/navigation";
import AnalysisReport from "@/app/ExtensionDossier";
import { getExtensionProduct, getVersionScanProduct } from "@/lib/productData";
import { parseExtensionDossierData } from "@/lib/reportContract";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { cloudflareSessionActive } from "@/lib/cloudflareSession";
import { serverDb } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function ImmutableScanPage({
  params,
}: {
  params: Promise<{ id: string; version: string; scanId: string }>;
}) {
  const route = await params;
  const id = decodeURIComponent(route.id);
  const version = decodeURIComponent(route.version);
  const scanId = decodeURIComponent(route.scanId);
  const cloudflare = cloudflarePrivateAvailable();
  const [claims, extensionProduct, versionProduct] = await Promise.all([
    cloudflare ? cloudflareSessionActive() : serverDb().then((db) => db.auth.getClaims().then((result) => Boolean(result.data?.claims))).catch(() => false),
    getExtensionProduct(id),
    getVersionScanProduct(id, version, scanId, undefined, { skipCloudflareCatalog: true }),
  ]);
  if (!extensionProduct || !versionProduct?.scan) notFound();
  let data = null;
  try {
    data = parseExtensionDossierData({
      id,
      version,
      extension: extensionProduct.extension,
      versions: extensionProduct.versions,
      scan: versionProduct.scan,
      findings: versionProduct.findings || [],
      files: versionProduct.files || [],
      dependencies: versionProduct.dependencies || [],
    });
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <main className="versionProductPage">
        <section className="emptyVersion">
          <span>Report unavailable</span>
          <h1>This immutable report cannot be verified.</h1>
          <p>
            The report is missing required exact-artifact identity or uses an
            unsupported outcome. It has not been presented as a security
            decision.
          </p>
        </section>
      </main>
    );
  }
  return <AnalysisReport data={data} signedIn={claims} />;
}
