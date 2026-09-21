import type { PublicMetrics } from "@/lib/publicMetrics";
import type {
  CatalogExtension,
  PublicInventory,
  PublicInventoryItem,
  PublicSecurityFeedItem,
} from "@/lib/productData";
import {
  getCloudflareRegistrySection,
  getCloudflareRegistryProduct,
  getCloudflareRegistrySnapshot,
} from "@/lib/cloudflareRegistry";
import { hasAccuracyGateAttestation } from "@/lib/publicationHealth";

const DEFAULT_SNAPSHOT_URL =
  "https://raw.githubusercontent.com/preethamak/IDE_Scanner_web/main/public/registry-snapshot.json";
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

export type PublicRegistryProduct = {
  detail_state?: "complete" | "summary_only";
  extension: CatalogExtension;
  versions: Array<Record<string, unknown>>;
  scans: Array<{
    version: string;
    scan: Record<string, unknown>;
    findings: Array<Record<string, unknown>>;
    files: Array<Record<string, unknown>>;
    dependencies: Array<Record<string, unknown>>;
  }>;
};

export type PublicRegistrySnapshot = {
  schema_version: 1;
  generated_at: string;
  metrics: PublicMetrics;
  feed: PublicSecurityFeedItem[];
  inventory: PublicInventory;
  history?: PublicInventoryItem[];
  catalog: CatalogExtension[];
  benchmark: {
    rows: Array<Record<string, unknown>>;
    published: number;
    awaiting: number;
  };
  products: Record<string, PublicRegistryProduct>;
};

let cached: { expiresAt: number; value: PublicRegistrySnapshot | null } | null =
  null;

/**
 * Read-only emergency mirror for the public registry. The mirror is generated
 * by GitHub Actions through the direct Postgres connection and is only used
 * when Supabase's REST service is unavailable.
 */
export async function getPublicRegistrySnapshot(): Promise<PublicRegistrySnapshot | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const cloudflareSnapshot = await getCloudflareRegistrySnapshot<PublicRegistrySnapshot>();
  if (cloudflareSnapshot) {
    const value = cloudflareSnapshot as PublicRegistrySnapshot;
    if (!hasAccuracyGateAttestation(value.inventory?.publication)) return null;
    cached = { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value };
    return value;
  }

  const url = process.env.PUBLIC_REGISTRY_SNAPSHOT_URL || DEFAULT_SNAPSHOT_URL;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Registry mirror returned ${response.status}`);
    const body = (await response.json()) as Partial<PublicRegistrySnapshot>;
    if (
      body.schema_version !== 1 ||
      typeof body.generated_at !== "string" ||
      !body.metrics ||
      !Array.isArray(body.feed) ||
      !body.inventory ||
      !hasAccuracyGateAttestation(body.inventory.publication) ||
      !Array.isArray(body.catalog) ||
      !body.benchmark ||
      !Array.isArray(body.benchmark.rows) ||
      !body.products ||
      typeof body.products !== "object"
    ) {
      throw new Error("Registry mirror has an unsupported shape");
    }
    cached = { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value: body as PublicRegistrySnapshot };
    return cached.value;
  } catch {
    cached = { expiresAt: Date.now() + 30_000, value: null };
    return null;
  }
}

export async function getPublicRegistryProduct(
  id: string,
): Promise<PublicRegistryProduct | null> {
  const cloudflareInventory = await getCloudflareRegistrySection<PublicInventory>("inventory");
  const cloudflareProduct = hasAccuracyGateAttestation(cloudflareInventory?.publication)
    ? await getCloudflareRegistryProduct<PublicRegistryProduct>(id)
    : null;
  if (cloudflareProduct) return cloudflareProduct;
  const snapshot = await getPublicRegistrySnapshot();
  if (!snapshot) return null;
  const key = Object.keys(snapshot.products).find(
    (candidate) => candidate.toLowerCase() === id.toLowerCase(),
  );
  return key ? snapshot.products[key] : null;
}
