import type { MarketplaceSearchResult } from "@/lib/types";
import { DEFAULT_DEEP_SCAN_SUPPORT_REASON } from "@/lib/deepScanSupport";

const GALLERY_URL = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1";

type GalleryExtension = {
  extensionName?: string;
  displayName?: string;
  shortDescription?: string;
  lastUpdated?: string;
  publisher?: { publisherName?: string; displayName?: string; isDomainVerified?: boolean; flags?: string };
  versions?: Array<{ version?: string; lastUpdated?: string; files?: Array<{ assetType?: string; source?: string }> }>;
  statistics?: Array<{ statisticName?: string; value?: number }>;
};

export async function searchMarketplace(query: string, limit = 50): Promise<MarketplaceSearchResult[]> {
  const exactId = tryNormalizeMarketplaceId(query);
  if (exactId) {
    const exact = await resolveExactExtension(exactId);
    if (exact) return [exact];
  }
  // Search both public registries. A result in one catalog must not hide a
  // valid extension from the other one.
  const [marketplace, openVsx] = await Promise.allSettled([
    searchVsMarketplace(query, limit),
    searchOpenVsx(query, limit),
  ]);
  const combined = [
    ...(marketplace.status === "fulfilled" ? marketplace.value : []),
    ...(openVsx.status === "fulfilled" ? openVsx.value : []),
  ];
  const unique = new Map<string, MarketplaceSearchResult>();
  for (const item of combined) if (!unique.has(item.extension_id.toLowerCase())) unique.set(item.extension_id.toLowerCase(), item);
  if (marketplace.status === "rejected" && openVsx.status === "rejected") {
    throw new Error("Neither VS Marketplace nor Open VSX could be reached.");
  }
  return [...unique.values()].sort((left, right) => relevance(right, query) - relevance(left, query)).slice(0, limit);
}

async function searchVsMarketplace(query: string, limit: number): Promise<MarketplaceSearchResult[]> {
  const response = await registryFetch(GALLERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 10, value: query }], pageNumber: 1, pageSize: Math.min(limit, 100), sortBy: 4 }], flags: 914 }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`VS Marketplace search returned ${response.status}`);
  const data = await response.json() as { results?: Array<{ extensions?: GalleryExtension[] }> };
  return (data.results?.[0]?.extensions || []).map(normalizeExtension).filter((item): item is MarketplaceSearchResult => Boolean(item));
}

export async function listPublisherExtensions(
  publisher: string,
  limit = 100,
): Promise<MarketplaceSearchResult[]> {
  const clean = publisher.trim();
  if (!/^[\w-]{1,128}$/.test(clean)) throw new Error("Publisher identity is invalid.");
  const response = await registryFetch(GALLERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
    body: JSON.stringify({
      filters: [{ criteria: [{ filterType: 18, value: clean }], pageNumber: 1, pageSize: Math.min(limit, 100), sortBy: 4 }],
      flags: 914,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`VS Marketplace publisher lookup returned ${response.status}`);
  const data = await response.json() as { results?: Array<{ extensions?: GalleryExtension[] }> };
  return (data.results?.[0]?.extensions || [])
    .map(normalizeExtension)
    .filter((item): item is MarketplaceSearchResult => Boolean(item))
    .filter((item) => item.publisher.toLocaleLowerCase() === clean.toLocaleLowerCase())
    .sort((left, right) => right.install_count - left.install_count);
}

async function searchOpenVsx(query: string, limit: number): Promise<MarketplaceSearchResult[]> {
  const response = await registryFetch(`https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&size=${Math.min(limit, 100)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Open VSX search returned ${response.status}`);
  const data = await response.json() as { extensions?: OpenVsxExtension[] };
  return (data.extensions || []).map(normalizeOpenVsx);
}

export async function resolveMarketplaceExtension(extensionId: string): Promise<MarketplaceSearchResult> {
  const normalized = normalizeMarketplaceId(extensionId);
  const direct = await resolveExactExtension(normalized);
  if (direct) return direct;
  const results = await searchMarketplace(normalized, 25);
  const exact = results.find((item) => item.extension_id.toLowerCase() === normalized.toLowerCase());
  if (!exact) {
    const openvsx = await resolveOpenVsxExtension(normalized);
    if (openvsx) return openvsx;
    throw new Error(`Extension ${normalized} was not found on VS Marketplace or Open VSX.`);
  }
  return exact;
}

async function resolveExactExtension(extensionId: string): Promise<MarketplaceSearchResult | null> {
  // An exact VS Marketplace identity is the primary answer. Waiting for a
  // secondary registry made a simple extension lookup feel broken whenever
  // Open VSX was slow, even though the requested extension was already known.
  try {
    const marketplace = await resolveVsMarketplaceExtension(extensionId);
    if (marketplace) return marketplace;
  } catch { /* Fall through to Open VSX when Marketplace is unavailable. */ }
  try { return await resolveOpenVsxExtension(extensionId); } catch { return null; }
}

async function resolveVsMarketplaceExtension(extensionId: string): Promise<MarketplaceSearchResult | null> {
  const response = await registryFetch(GALLERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: extensionId }], pageNumber: 1, pageSize: 1 }], flags: 914 }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`VS Marketplace lookup returned ${response.status}`);
  const data = await response.json() as { results?: Array<{ extensions?: GalleryExtension[] }> };
  return normalizeExtension(data.results?.[0]?.extensions?.[0] || {});
}

export async function listMarketplaceVersions(extensionId: string): Promise<Array<{ extension_id: string; version: string; registry: "vs-marketplace" | "openvsx"; published_at: string; download_url: string; is_latest: boolean; scan_state: "not_scanned" }>> {
  const normalized = normalizeMarketplaceId(extensionId);
  const [publisher, name] = normalized.split(".", 2);
  const marketplace = await registryFetch(GALLERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
    // The version list is enough for the release timeline. Do not request the
    // package assets for every historical version; large extensions can return
    // several megabytes here and make an edge-rendered profile exceed Worker
    // CPU limits before the page can be sent.
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: normalized }], pageNumber: 1, pageSize: 1 }], flags: 1 }),
    cache: "no-store",
  }).then(async (response) => response.ok ? response.json() as Promise<{ results?: Array<{ extensions?: GalleryExtension[] }> }> : null).catch(() => null);
  const raw = marketplace?.results?.[0]?.extensions?.[0];
  const uniqueVersions = [...new Map((raw?.versions || []).filter((item) => item.version).map((item) => [String(item.version), item])).values()];
  const versions = uniqueVersions.map((item, index) => ({ extension_id: normalized, version: String(item.version), registry: "vs-marketplace" as const, published_at: String(item.lastUpdated || ""), download_url: `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${encodeURIComponent(publisher)}/vsextensions/${encodeURIComponent(name)}/${encodeURIComponent(String(item.version))}/vspackage`, is_latest: index === 0, scan_state: "not_scanned" as const }));
  if (versions.length) return versions;

  const openvsx = await registryFetch(`https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`, { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<OpenVsxExtension & { allVersions?: Record<string, string> }> : null).catch(() => null);
  if (!openvsx) return [];
  const all = Object.keys(openvsx.allVersions || {}).filter(isConcreteVersion);
  const versionValues = all.length ? all : openvsx.version ? [openvsx.version] : [];
  return versionValues.map((version, index) => ({ extension_id: normalized, version, registry: "openvsx" as const, published_at: version === openvsx.version ? String(openvsx.timestamp || "") : "", download_url: version === openvsx.version ? String(openvsx.files?.download || "") : `https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/file/${encodeURIComponent(publisher)}.${encodeURIComponent(name)}-${encodeURIComponent(version)}.vsix`, is_latest: index === 0 || version === openvsx.version, scan_state: "not_scanned" as const }));
}

export function isConcreteVersion(value: string): boolean {
  return Boolean(value.trim()) && !["latest"].includes(value.trim().toLowerCase());
}

export function marketplaceVsixUrl(item: MarketplaceSearchResult): string {
  if (item.download_url) return item.download_url;
  const [, name] = item.extension_id.split(".", 2);
  return `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${encodeURIComponent(item.publisher)}/vsextensions/${encodeURIComponent(name)}/${encodeURIComponent(item.version)}/vspackage`;
}

export function deepScanSupportError(item: MarketplaceSearchResult | null | undefined): string | null {
  if (item?.scan_supported !== false) return null;
  return item?.scan_support_reason || DEFAULT_DEEP_SCAN_SUPPORT_REASON;
}

export function normalizeMarketplaceId(value: string): string {
  const raw = value.trim();
  const vscodePrefix = "vscode:extension/";
  if (raw.toLowerCase().startsWith(vscodePrefix)) return raw.slice(vscodePrefix.length).split(/[?#]/, 1)[0];
  try {
    const url = new URL(raw);
    const itemName = url.searchParams.get("itemName");
    if (itemName) return itemName;
  } catch { /* It is already an extension id. */ }
  if (!/^[\w-]+\.[\w.-]+$/.test(raw)) throw new Error("Use publisher.extension, a Marketplace URL, or vscode:extension/ URI.");
  return raw;
}

function tryNormalizeMarketplaceId(value: string): string | null {
  try { return normalizeMarketplaceId(value); } catch { return null; }
}

function relevance(item: MarketplaceSearchResult, query: string): number {
  const needle = query.trim().toLowerCase();
  const terms = needle.split(/\s+/).filter(Boolean);
  const id = item.extension_id.toLowerCase();
  const name = item.display_name.toLowerCase();
  const description = item.short_description.toLowerCase();
  let score = 0;
  if (id === needle || name === needle) score += 1000;
  if (id.startsWith(needle) || name.startsWith(needle)) score += 300;
  for (const term of terms) {
    if (name.includes(term)) score += 80;
    if (id.includes(term)) score += 55;
    if (description.includes(term)) score += 10;
  }
  if (item.publisher.toLowerCase() === needle || item.publisher_display_name.toLowerCase() === needle) score += 500;
  if (item.publisher_verified) score += 4;
  const popularity = Math.min(Math.log10(Math.max(1, item.install_count)), 8);
  const ratingConfidence = item.rating_count > 0 ? Math.min(item.rating_count / 1000, 2) : 0;
  return score + popularity + ratingConfidence;
}

function normalizeExtension(raw: GalleryExtension): MarketplaceSearchResult | null {
  const publisher = raw.publisher?.publisherName || "";
  const name = raw.extensionName || "";
  const version = raw.versions?.[0];
  if (!publisher || !name || !version?.version) return null;
  const stats = Object.fromEntries((raw.statistics || []).map((item) => [item.statisticName?.toLowerCase(), item.value || 0]));
  const icon = version.files?.find((item) => item.assetType === "Microsoft.VisualStudio.Services.Icons.Small") || version.files?.find((item) => item.assetType === "Microsoft.VisualStudio.Services.Icons.Default");
  const assetTypes = (version.files || []).map((item) => String(item.assetType || "")).filter(Boolean);
  const hasVsCodeManifest = assetTypes.includes("Microsoft.VisualStudio.Code.Manifest");
  const hasVisualStudioVsix = assetTypes.some((assetType) => {
    const normalized = assetType.toLowerCase();
    return normalized.endsWith(".vsix") || normalized.endsWith("vsixpackage");
  });
  const scanSupported = assetTypes.length ? hasVsCodeManifest || hasVisualStudioVsix : undefined;
  return {
    extension_id: `${publisher}.${name}`,
    display_name: raw.displayName || name,
    publisher,
    publisher_display_name: raw.publisher?.displayName || publisher,
    // `flags` is a listing flag and is returned as "verified" for publishers
    // that are not domain verified. Only the explicit domain-verification bit
    // is safe to present as a verified publisher badge.
    publisher_verified: raw.publisher?.isDomainVerified === true,
    short_description: raw.shortDescription || "",
    version: version.version,
    last_updated: version.lastUpdated || raw.lastUpdated || "",
    install_count: Number(stats.install || 0),
    rating_average: Number(stats.averagerating || 0),
    rating_count: Number(stats.ratingcount || 0),
    icon_url: icon?.source || "",
    registry: "vs-marketplace",
    scan_supported: scanSupported,
    scan_support_reason: undefined,
  };
}

type OpenVsxExtension = { name?: string; namespace?: string; version?: string; displayName?: string; description?: string; verified?: boolean; downloadCount?: number; averageRating?: number; reviewCount?: number; timestamp?: string; files?: { download?: string; icon?: string } };

function normalizeOpenVsx(raw: OpenVsxExtension): MarketplaceSearchResult {
  const publisher = raw.namespace || "unknown";
  const name = raw.name || "extension";
  return { extension_id: `${publisher}.${name}`, display_name: raw.displayName || name, publisher, publisher_display_name: publisher, publisher_verified: Boolean(raw.verified), short_description: raw.description || "", version: raw.version || "", last_updated: raw.timestamp || "", install_count: Number(raw.downloadCount || 0), rating_average: Number(raw.averageRating || 0), rating_count: Number(raw.reviewCount || 0), icon_url: raw.files?.icon || "", registry: "openvsx", download_url: raw.files?.download || "", scan_supported: true };
}

async function resolveOpenVsxExtension(extensionId: string): Promise<MarketplaceSearchResult | null> {
  const [publisher, name] = extensionId.split(".", 2);
  const response = await registryFetch(`https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open VSX lookup returned ${response.status}`);
  return normalizeOpenVsx(await response.json() as OpenVsxExtension);
}

const REGISTRY_TIMEOUT_MS = 3_500;

async function registryFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const signal = AbortSignal.timeout(REGISTRY_TIMEOUT_MS);
  return fetch(input, { ...init, signal });
}
