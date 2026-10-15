import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { requireTeamRole } from "@/lib/teams";
import { serviceDb } from "@/lib/supabase";
import { baselineEligible } from "@/lib/teamMonitoring";
import { requireEntitlement } from "@/lib/entitlements";
import { getWorkspaceState, saveState } from "@/lib/cloudflareWorkspace";
import { getCloudflareRegistryCatalogExtension, getCloudflareRegistryProduct } from "@/lib/cloudflareRegistry";
import { resolveMarketplaceExtension } from "@/lib/marketplace";
import { nowIso } from "@/lib/cloudflarePrivate";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, provider } = await authenticated(request); const { id } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin", "analyst", "viewer"]);
    if (provider === "cloudflare") {
      const state = await getWorkspaceState(id);
      const monitoring = state.monitoring && typeof state.monitoring === "object" && !Array.isArray(state.monitoring)
        ? state.monitoring as Record<string, unknown>
        : null;
      return NextResponse.json({ items: state.watchlist, health: monitoring || { status: "unknown", last_checked_at: null, next_check_at: null, cadence_hours: 6, error: "Monitoring has not completed its first scheduled check." } });
    }
    const db=serviceDb();
    const [{ data, error }, refreshResult] = await Promise.all([
      db.from("team_watchlist_items").select("extension_id,created_at,baseline_version,baseline_artifact_sha256,monitoring_state,last_observed_version,last_event_at,extensions(display_name,icon_url)").eq("team_id", id).order("created_at", { ascending: false }),
      db.from("registry_refreshes").select("registry,status,started_at,completed_at,error").order("started_at", { ascending: false }).limit(6),
    ]);
    if (error) throw error;
    const latest=new Map<string,Record<string,unknown>>();
    for(const row of (refreshResult.data||[]) as Array<Record<string,unknown>>){const registry=String(row.registry||"");if(registry&&!latest.has(registry))latest.set(registry,row)}
    const refreshes=[...latest.values()]; const completed=refreshes.map((row)=>String(row.completed_at||"")).filter(Boolean).sort().at(-1)||null;
    const failed=refreshes.find((row)=>String(row.status)==="failed"); const next=completed?new Date(new Date(completed).getTime()+6*60*60*1000).toISOString():null;
    return NextResponse.json({ items: data || [], health:{status:failed?"degraded":completed?"healthy":"unknown",last_checked_at:completed,next_check_at:next,cadence_hours:6,error:failed?String(failed.error||"A registry refresh failed."):null} });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Team watchlist lookup failed." }, { status: 403 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, provider } = await authenticated(request); const { id } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin", "analyst"]);
    const body = await request.json(); const extensionId = typeof body.extension_id === "string" ? body.extension_id.trim() : "";
    const baselineScanId = typeof body.baseline_scan_id === "string" ? body.baseline_scan_id.trim() : "";
    const requestedVersion = typeof body.version === "string" ? body.version.trim() : "";
    const requestedRegistry = body.registry === "openvsx" ? "openvsx" : "vs-marketplace";
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(extensionId)) return NextResponse.json({ error: "A valid extension id is required." }, { status: 400 });
    if (baselineScanId && !/^[0-9a-f-]{36}$/i.test(baselineScanId)) return NextResponse.json({ error: "A valid completed baseline scan is required." }, { status: 400 });
    if (requestedVersion && requestedVersion.length > 256) return NextResponse.json({ error: "The extension version is invalid." }, { status: 400 });
    if (provider === "cloudflare") {
      const product = await getCloudflareRegistryProduct<{ extension?: Record<string, unknown>; versions?: Array<Record<string, unknown>> }>(extensionId);
      let extension = product?.extension || await getCloudflareRegistryCatalogExtension<Record<string, unknown>>(extensionId);
      let versions = product?.versions || [];
      let registry = requestedRegistry;
      if (!extension) {
        try {
          const marketplace = await resolveMarketplaceExtension(extensionId);
          extension = { id: marketplace.extension_id, display_name: marketplace.display_name, icon_url: marketplace.icon_url };
          versions = [{ version: marketplace.version, is_latest: true }];
          registry = marketplace.registry || requestedRegistry;
        } catch {
          return NextResponse.json({ error: "Add this extension to the registry before monitoring it." }, { status: 404 });
        }
      }
      const state = await getWorkspaceState(id);
      const existing = state.watchlist.find((item) => String(item.extension_id).toLowerCase() === extensionId.toLowerCase());
      if (existing) return NextResponse.json(existing, { status: 200 });
      const selected = requestedVersion || String((versions.find((version) => version.is_latest) || versions[0])?.version || "");
      const item = { extension_id: extensionId, registry, created_at: nowIso(), baseline_version: selected || null, monitoring_state: "monitoring", last_observed_version: selected || null, last_event_at: nowIso(), extensions: { display_name: String(extension.display_name || extensionId), icon_url: String(extension.icon_url || "") } };
      state.watchlist.unshift(item);
      await saveState(id, state);
      return NextResponse.json(item, { status: 201 });
    }
    const db = serviceDb(); const { data: registeredExtension, error: extensionError } = await db.from("extensions").select("id").ilike("id", extensionId).maybeSingle();
    if (extensionError) throw extensionError;
    let extension = registeredExtension;
    if (!extension) {
      const marketplace = await resolveMarketplaceExtension(extensionId);
      const registered = await db.from("extensions").upsert({
        id: marketplace.extension_id,
        name: marketplace.extension_id.split(".").slice(1).join("."),
        display_name: marketplace.display_name,
        publisher: marketplace.publisher,
        description: marketplace.short_description || "",
        registry: marketplace.registry || "vs-marketplace",
        publisher_verified: marketplace.publisher_verified,
        installs: marketplace.install_count,
        rating: marketplace.rating_average,
        icon_url: marketplace.icon_url || "",
        repository_url: "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (registered.error) throw registered.error;
      extension = { id: marketplace.extension_id };
    }
    const existing = await db.from("team_watchlist_items").select("extension_id").eq("team_id", id).eq("extension_id", extension.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) await requireEntitlement(id, "monitored_extensions", 1);
    let baseline: { id: string; version: string; artifact_sha256: string | null; analysis_status: string; coverage_percent: number | null } | null = null;
    if (baselineScanId) {
      const result = await db.from("scans").select("id,version,artifact_sha256,analysis_status,coverage_percent").eq("id", baselineScanId).eq("extension_id", extension.id).maybeSingle();
      if (result.error) throw result.error;
      baseline = result.data;
      if (!baselineEligible(baseline || {})) return NextResponse.json({ error: "This report is not a complete exact-artifact baseline yet." }, { status: 400 });
    }
    const write = baseline
      ? db.from("team_watchlist_items").upsert({ team_id: id, extension_id: extension.id, created_by: user.id, baseline_scan_id: baseline.id, baseline_version: baseline.version, baseline_artifact_sha256: baseline.artifact_sha256, monitoring_state: "monitoring", last_observed_version: baseline.version, last_event_at: new Date().toISOString() }, { onConflict: "team_id,extension_id" })
      : db.from("team_watchlist_items").upsert({ team_id: id, extension_id: extension.id, created_by: user.id }, { onConflict: "team_id,extension_id" });
    const { data, error } = await write.select("extension_id,created_at,baseline_version,baseline_artifact_sha256,monitoring_state").single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Team watchlist update failed." }, { status: 403 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, provider } = await authenticated(request); const { id } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin", "analyst"]);
    const extensionId = new URL(request.url).searchParams.get("extension_id") || "";
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(extensionId)) return NextResponse.json({ error: "A valid extension id is required." }, { status: 400 });
    if (provider === "cloudflare") {
      const state = await getWorkspaceState(id);
      const before = state.watchlist.length;
      state.watchlist = state.watchlist.filter((item) => String(item.extension_id).toLowerCase() !== extensionId.toLowerCase());
      if (state.watchlist.length === before) return NextResponse.json({ error: "Team watchlist item not found." }, { status: 404 });
      await saveState(id, state);
      return new NextResponse(null, { status: 204 });
    }
    const { data, error } = await serviceDb().from("team_watchlist_items").delete().eq("team_id", id).ilike("extension_id", extensionId).select("extension_id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Team watchlist item not found." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Team watchlist update failed." }, { status: 403 }); }
}
