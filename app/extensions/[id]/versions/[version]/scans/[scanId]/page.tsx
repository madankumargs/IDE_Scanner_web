import { notFound } from "next/navigation";
import AnalysisReport from "@/app/ExtensionDossier";
import { getExtensionProduct, getVersionScanProduct } from "@/lib/productData";
import { parseExtensionDossierData } from "@/lib/reportContract";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { cloudflareSessionActive } from "@/lib/cloudflareSession";
import { serverDb } from "@/lib/supabaseServer";
import { serviceDb } from "@/lib/supabase";
import { validAnonymousReportKey } from "@/lib/anonymousScanToken";

export const dynamic = "force-dynamic";

export default async function ImmutableScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; version: string; scanId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const route = await params;
  const query = searchParams ? await searchParams : {};
  const rawKey = query.key;
  const anonKey = Array.isArray(rawKey) ? rawKey[0] : typeof rawKey === "string" ? rawKey : "";
  const id = decodeURIComponent(route.id);
  const version = decodeURIComponent(route.version);
  const scanId = decodeURIComponent(route.scanId);
  const cloudflare = cloudflarePrivateAvailable();
  const [claims, extensionProduct, versionProduct] = await Promise.all([
    cloudflare ? cloudflareSessionActive() : serverDb().then((db) => db.auth.getClaims().then((result) => Boolean(result.data?.claims))).catch(() => false),
    getExtensionProduct(id),
    (async () => {
      const normal = await getVersionScanProduct(id, version, scanId);
      if (normal) return normal;
      if (!anonKey || cloudflare) return null;
      // Anonymous private scan: the report URL already contains an unguessable
      // scan UUID, and the key is a server-issued capability bound to its job.
      // Only honor it for jobs with no authenticated owner.
      try {
        const db = serviceDb();
        const jobLink = await db.from("scans").select("job_id").eq("id", scanId).maybeSingle();
        const jobId = jobLink.data?.job_id ? String(jobLink.data.job_id) : "";
        if (!jobId || !validAnonymousReportKey(jobId, anonKey)) return null;
        const job = await db.from("scan_jobs").select("requested_by").eq("id", jobId).maybeSingle();
        if (job.data?.requested_by) return null;
        return getVersionScanProduct(id, version, scanId, db);
      } catch { return null; }
    })(),
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
