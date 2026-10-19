import { notFound } from "next/navigation";
import AnalysisReport from "@/app/ExtensionDossier";
import FullReportSignInGate from "@/app/FullReportSignInGate";
import { getExtensionProduct, getVersionScanProduct } from "@/lib/productData";
import { parseExtensionDossierData } from "@/lib/reportContract";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { cloudflareGuestTrialToken, cloudflareSessionActive, cloudflareSessionUser } from "@/lib/cloudflareSession";
import { serverDb } from "@/lib/supabaseServer";
import { runtimeSupabase } from "@/lib/supabaseRuntime";
import { reportProofPresentation } from "@/lib/reportProofPresentation";

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
  const cloudflareUser = cloudflare ? await cloudflareSessionUser() : null;
  // Cloudflare injects runtime variables per request. Use the runtime
  // Supabase client as the compatibility path for immutable reports that
  // predate the D1 publication mirror; the report still has to pass the
  // exact version/scan identity checks in getVersionScanProduct.
  const legacyClient = cloudflare ? runtimeSupabase() : null;
  const [claims, extensionProduct, versionProduct] = await Promise.all([
    cloudflare ? (cloudflareUser ? true : cloudflareSessionActive()) : serverDb().then((db) => db.auth.getClaims().then((result) => Boolean(result.data?.claims))).catch(() => false),
    getExtensionProduct(id, legacyClient || undefined),
    getVersionScanProduct(id, version, scanId, legacyClient || undefined, {
      skipCloudflareCatalog: true,
      authorizedUserId: cloudflareUser?.id,
      guestTrialToken: cloudflare ? await cloudflareGuestTrialToken() : undefined,
    }),
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
  if (!claims) {
    return (
      <FullReportSignInGate
        extension={extensionProduct.extension}
        version={version}
        scan={versionProduct.scan as Record<string, unknown>}
        proof={reportProofPresentation({
          scan: versionProduct.scan as Record<string, unknown>,
          findings: versionProduct.findings,
          files: versionProduct.files,
          dependencies: versionProduct.dependencies,
        })}
        returnHref={`/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/scans/${encodeURIComponent(scanId)}`}
      />
    );
  }
  return <AnalysisReport data={data} signedIn={claims} />;
}
